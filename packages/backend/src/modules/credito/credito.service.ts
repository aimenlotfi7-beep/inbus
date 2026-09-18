import { eq, and, lt, sql } from 'drizzle-orm';
import { inizioOggiRoma } from '../../shared/formato.js';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, movimentiCredito, partecipantiPrenotazione } from '../../db/schema.js';
import { leggiCreditoPerPasseggero, leggiCreditoReferralInvitante, leggiCreditoReferralAmico } from '../impostazioni/impostazioni.routes.js';
import { ConflittoDati } from '../../shared/errors.js';

export const creditoService = {
  /** Matura subito il credito di UNA prenotazione specifica — chiamata
   *  nel momento esatto in cui il pagamento risulta completo (biglietto
   *  emesso), non più dopo il viaggio: ora che il cliente non può più
   *  cancellare da solo (serve una richiesta di rimborso approvata da
   *  un amministratore), non c'è più il rischio di prenota+cancella per
   *  accumularlo gratis. Non fa nulla se questa prenotazione ha già
   *  maturato il suo credito (evita doppioni se richiamata più volte). */
  async maturaCreditoSubito(prenotazioneId: string) {
    const creditoPerPasseggero = await leggiCreditoPerPasseggero();
    if (creditoPerPasseggero <= 0) return;
    await maturaUnaVolta(prenotazioneId, creditoPerPasseggero, (pnr) => `Prenotazione confermata — PNR ${pnr}`);
  },

  /** Toglie il credito già maturato da una prenotazione, se ce n'era —
   *  chiamata quando un rimborso viene approvato. Non lascia mai il
   *  saldo del cliente sotto zero (se nel frattempo l'ha già speso
   *  altrove, si toglie solo quanto resta disponibile). */
  async revocaCreditoSePresente(prenotazioneId: string) {
    await db.transaction(async (tx) => {
      // Il segno "maturato" si toglie per primo, con la condizione: due
      // revoche insieme (doppio clic, due amministratori) ne fanno una sola.
      const [p] = await tx.update(prenotazioni).set({ creditoMaturato: false })
        .where(and(eq(prenotazioni.id, prenotazioneId), eq(prenotazioni.creditoMaturato, true)))
        .returning();
      if (!p) return;

      const [{ importo: importoOriginale }] = await tx
        .select({ importo: sql<string>`coalesce(sum(${movimentiCredito.importo}), '0')` })
        .from(movimentiCredito)
        .where(and(eq(movimentiCredito.prenotazioneId, prenotazioneId), sql`${movimentiCredito.importo} > 0`));
      const importo = Number(importoOriginale);
      if (importo <= 0) return;

      // Riga del cliente bloccata: il saldo letto qui è quello che si aggiorna.
      const [u] = await tx.select({ credito: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.id, p.utenteId)).for('update').limit(1);
      const daTogliere = Math.min(importo, Number(u?.credito ?? 0));
      if (daTogliere <= 0) return;
      await tx.insert(movimentiCredito).values({
        utenteId: p.utenteId,
        importo: (-daTogliere).toFixed(2),
        motivo: `Rimborso approvato — PNR ${p.pnr}`,
        prenotazioneId: p.id,
      });
      await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} - ${daTogliere.toFixed(2)}::numeric` }).where(eq(utenti.id, p.utenteId));
    });
  },

  /** Rimborso approvato: il credito che il cliente aveva usato su questa
   *  prenotazione torna disponibile. Una volta sola: il movimento di
   *  restituzione, se c'è già, lo impedisce (con la prenotazione bloccata,
   *  così due chiamate insieme non passano entrambe il controllo). */
  async restituisciCreditoUsato(prenotazioneId: string) {
    await db.transaction(async (tx) => {
      const [p] = await tx.select().from(prenotazioni).where(eq(prenotazioni.id, prenotazioneId)).for('update').limit(1);
      const importo = p ? Number(p.creditoUsato) : 0;
      if (!p || importo <= 0) return;
      const motivo = `Credito restituito — rimborso PNR ${p.pnr}`;
      const [giaFatto] = await tx.select({ id: movimentiCredito.id }).from(movimentiCredito)
        .where(and(eq(movimentiCredito.prenotazioneId, p.id), eq(movimentiCredito.motivo, motivo))).limit(1);
      if (giaFatto) return;
      await tx.insert(movimentiCredito).values({ utenteId: p.utenteId, importo: importo.toFixed(2), motivo, prenotazioneId: p.id });
      await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo.toFixed(2)}::numeric` }).where(eq(utenti.id, p.utenteId));
    });
  },

  /** Da chiamare una volta al giorno (scheduler): trova le prenotazioni
   *  il cui viaggio è ormai avvenuto per davvero (data evento passata),
   *  pagate per intero, non ancora "maturate" — e accredita il cliente.
   *  Apposta DOPO il viaggio, non alla prenotazione: altrimenti
   *  basterebbe prenotare e cancellare subito per accumulare credito
   *  gratis. */
  async maturaCreditoViaggiConclusi() {
    const creditoPerPasseggero = await leggiCreditoPerPasseggero();
    if (creditoPerPasseggero <= 0) return { maturate: 0 };

    const daMaturare = await db
      .select({ prenotazioneId: prenotazioni.id, utenteId: prenotazioni.utenteId, pnr: prenotazioni.pnr })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(and(
        eq(prenotazioni.stato, 'CONFERMATA'),
        eq(prenotazioni.saldoPagato, true),
        eq(prenotazioni.creditoMaturato, false),
        // Viaggio concluso = evento di un giorno precedente a oggi (ora di Roma).
        lt(eventi.data, inizioOggiRoma()),
      ));

    let maturate = 0;
    for (const p of daMaturare) {
      if (await maturaUnaVolta(p.prenotazioneId, creditoPerPasseggero, (pnr) => `Viaggio completato — PNR ${pnr}`)) maturate++;
    }
    return { maturate };
  },

  /** Quanto credito ha davvero disponibile un cliente, dalla sua email
   *  (usata al checkout, dove non c'è login — solo l'email in comune). */
  async creditoDisponibile(email: string): Promise<number> {
    const [u] = await db.select({ credito: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    return u ? Number(u.credito) : 0;
  },

  /** Scala il credito usato al momento di una prenotazione — chiamata
   *  DENTRO la stessa transazione della creazione prenotazione, per non
   *  rischiare mai di scalare credito senza che la prenotazione vada a
   *  buon fine (o viceversa). Non lascia mai il saldo sotto zero. */
  async usaCredito(tx: typeof db, utenteId: string, importo: number, prenotazioneId: string, pnr: string) {
    if (importo <= 0) return;
    // Controllo e sottrazione nello stesso comando: prima si leggeva il
    // saldo e poi si toglieva, e due prenotazioni insieme dello stesso
    // cliente spendevano due volte lo stesso credito (saldo negativo).
    const [scalato] = await tx.update(utenti)
      .set({ creditoDisponibile: sql`${utenti.creditoDisponibile} - ${importo.toFixed(2)}::numeric` })
      .where(and(eq(utenti.id, utenteId), sql`${utenti.creditoDisponibile} >= ${importo.toFixed(2)}::numeric`))
      .returning({ id: utenti.id });
    if (!scalato) throw new ConflittoDati('Il credito disponibile è cambiato — riprova.');

    await tx.insert(movimentiCredito).values({
      utenteId,
      importo: (-importo).toFixed(2),
      motivo: `Usato su prenotazione — PNR ${pnr}`,
      prenotazioneId,
    });
  },

  /** "Invita un amico" — il codice personale si genera solo la prima
   *  volta che serve (non a tutti alla registrazione: chi non apre mai
   *  quella sezione non ne ha bisogno). Riprova finché non trova un
   *  codice libero — estremamente improbabile che serva più di un
   *  tentativo, con 6 caratteri alfanumerici casuali. */
  async trovaOCreaCodiceReferral(utenteId: string): Promise<string> {
    const [esistente] = await db.select({ codice: utenti.codiceReferral }).from(utenti).where(eq(utenti.id, utenteId)).limit(1);
    if (esistente?.codice) return esistente.codice;

    const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O/1/I, si confondono leggendoli a voce
    for (let tentativo = 0; tentativo < 10; tentativo++) {
      const codice = Array.from({ length: 6 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('');
      try {
        await db.update(utenti).set({ codiceReferral: codice }).where(eq(utenti.id, utenteId));
        return codice;
      } catch {
        // Collisione (rarissima) — riprova con un altro.
      }
    }
    throw new Error('Impossibile generare un codice referral univoco.');
  },

  /** Il bonus dell'AMICO invitato — subito alla registrazione (deciso
   *  così: un vero benvenuto, non un'attesa). Chiamata una volta sola,
   *  nello stesso momento in cui invitatoDaUtenteId viene impostato —
   *  per natura non può ripetersi (un utente si registra una volta
   *  sola), non serve nessun controllo di doppio invio qui. */
  async erogaBonusReferralAmico(utenteId: string, nomeInvitante: string | null) {
    const importo = await leggiCreditoReferralAmico();
    if (importo <= 0) return;
    await db.transaction(async (tx) => {
      await tx.insert(movimentiCredito).values({
        utenteId,
        importo: importo.toFixed(2),
        motivo: `Benvenuto — invitato${nomeInvitante ? ` da ${nomeInvitante}` : ''}`,
      });
      await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo.toFixed(2)}` }).where(eq(utenti.id, utenteId));
    });
  },

  /** Il bonus di CHI INVITA — solo quando l'amico invitato conferma
   *  davvero la SUA prima prenotazione (non basta essersi iscritto),
   *  stesso principio di "nessun bonus per un invito finto mai usato
   *  per viaggiare davvero". Chiamata nello stesso punto in cui matura
   *  il credito normale (biglietto emesso) — se questa non è la prima
   *  prenotazione confermata dell'amico, o il bonus è già stato dato
   *  per lui, non fa nulla (bonusReferralInvitanteErogato lo impedisce
   *  anche in caso di doppia chiamata). */
  async maturaBonusReferralInvitanteSeAmicoNuovo(prenotazioneId: string) {
    const [p] = await db.select({ utenteId: prenotazioni.utenteId }).from(prenotazioni).where(eq(prenotazioni.id, prenotazioneId)).limit(1);
    if (!p) return;
    const [amico] = await db.select({ invitatoDa: utenti.invitatoDaUtenteId, bonusGiaDato: utenti.bonusReferralInvitanteErogato, nome: utenti.nome })
      .from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!amico?.invitatoDa || amico.bonusGiaDato) return;

    // "Prima prenotazione vera" = nessun'altra prenotazione CONFERMATA
    // con biglietto già emesso, a parte questa.
    const [{ numeroAltre }] = await db.select({ numeroAltre: sql<number>`count(*)::int` }).from(prenotazioni)
      .where(and(eq(prenotazioni.utenteId, p.utenteId), eq(prenotazioni.stato, 'CONFERMATA'), eq(prenotazioni.ticketStato, 'EMESSO'), sql`${prenotazioni.id} != ${prenotazioneId}`));
    if (numeroAltre > 0) return;

    const importo = await leggiCreditoReferralInvitante();
    if (importo <= 0) return;

    await db.transaction(async (tx) => {
      // Il segno "bonus dato" per primo, con la condizione: due biglietti
      // emessi insieme non danno il bonus due volte.
      const [primo] = await tx.update(utenti).set({ bonusReferralInvitanteErogato: true })
        .where(and(eq(utenti.id, p.utenteId), eq(utenti.bonusReferralInvitanteErogato, false)))
        .returning({ id: utenti.id });
      if (!primo) return;
      await tx.insert(movimentiCredito).values({
        utenteId: amico.invitatoDa!,
        importo: importo.toFixed(2),
        motivo: `Amico invitato${amico.nome ? ` (${amico.nome})` : ''} — prima prenotazione confermata`,
      });
      await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo.toFixed(2)}` }).where(eq(utenti.id, amico.invitatoDa!));
    });
  },
};

/** Accredita il credito fedeltà di una prenotazione una volta sola: il
 *  segno "maturato" si mette per primo, con la condizione, nella stessa
 *  transazione. Prima si controllava e poi si scriveva: due chiamate
 *  insieme (biglietto emesso e giro della notte, o due emissioni)
 *  accreditavano due volte. true se ha accreditato adesso. */
async function maturaUnaVolta(prenotazioneId: string, creditoPerPasseggero: number, motivo: (pnr: string) => string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [p] = await tx.update(prenotazioni).set({ creditoMaturato: true })
      .where(and(eq(prenotazioni.id, prenotazioneId), eq(prenotazioni.creditoMaturato, false)))
      .returning();
    if (!p) return false;
    const [{ numeroPasseggeri }] = await tx
      .select({ numeroPasseggeri: sql<number>`count(*)::int` })
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.prenotazioneId, prenotazioneId));
    const importo = (numeroPasseggeri * creditoPerPasseggero).toFixed(2);
    await tx.insert(movimentiCredito).values({ utenteId: p.utenteId, importo, motivo: motivo(p.pnr), prenotazioneId: p.id });
    await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo}::numeric` }).where(eq(utenti.id, p.utenteId));
    return true;
  });
}
