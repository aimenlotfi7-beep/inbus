import { eq, and, sql } from 'drizzle-orm';
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

    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, prenotazioneId)).limit(1);
    if (!p || p.creditoMaturato) return;

    const [{ numeroPasseggeri }] = await db
      .select({ numeroPasseggeri: sql<number>`count(*)::int` })
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.prenotazioneId, prenotazioneId));
    const importo = (numeroPasseggeri * creditoPerPasseggero).toFixed(2);

    await db.transaction(async (tx) => {
      await tx.insert(movimentiCredito).values({
        utenteId: p.utenteId,
        importo,
        motivo: `Prenotazione confermata — PNR ${p.pnr}`,
        prenotazioneId: p.id,
      });
      await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo}` }).where(eq(utenti.id, p.utenteId));
      await tx.update(prenotazioni).set({ creditoMaturato: true }).where(eq(prenotazioni.id, p.id));
    });
  },

  /** Toglie il credito già maturato da una prenotazione, se ce n'era —
   *  chiamata quando un rimborso viene approvato. Non lascia mai il
   *  saldo del cliente sotto zero (se nel frattempo l'ha già speso
   *  altrove, si toglie solo quanto resta disponibile). */
  async revocaCreditoSePresente(prenotazioneId: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, prenotazioneId)).limit(1);
    if (!p || !p.creditoMaturato) return;

    const [{ importo: importoOriginale }] = await db
      .select({ importo: sql<string>`coalesce(sum(${movimentiCredito.importo}), '0')` })
      .from(movimentiCredito)
      .where(and(eq(movimentiCredito.prenotazioneId, prenotazioneId), sql`${movimentiCredito.importo} > 0`));
    const importo = Number(importoOriginale);
    if (importo <= 0) return;

    const [u] = await db.select({ credito: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    const daTogliere = Math.min(importo, Number(u?.credito ?? 0));

    await db.transaction(async (tx) => {
      if (daTogliere > 0) {
        await tx.insert(movimentiCredito).values({
          utenteId: p.utenteId,
          importo: (-daTogliere).toFixed(2),
          motivo: `Rimborso approvato — PNR ${p.pnr}`,
          prenotazioneId: p.id,
        });
        await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} - ${daTogliere.toFixed(2)}` }).where(eq(utenti.id, p.utenteId));
      }
      await tx.update(prenotazioni).set({ creditoMaturato: false }).where(eq(prenotazioni.id, p.id));
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
        sql`${eventi.data} < now()`,
      ));

    let maturate = 0;
    for (const p of daMaturare) {
      const [{ numeroPasseggeri }] = await db
        .select({ numeroPasseggeri: sql<number>`count(*)::int` })
        .from(partecipantiPrenotazione)
        .where(eq(partecipantiPrenotazione.prenotazioneId, p.prenotazioneId));
      const importo = (numeroPasseggeri * creditoPerPasseggero).toFixed(2);

      await db.transaction(async (tx) => {
        await tx.insert(movimentiCredito).values({
          utenteId: p.utenteId,
          importo,
          motivo: `Viaggio completato — PNR ${p.pnr}`,
          prenotazioneId: p.prenotazioneId,
        });
        await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo}` }).where(eq(utenti.id, p.utenteId));
        await tx.update(prenotazioni).set({ creditoMaturato: true }).where(eq(prenotazioni.id, p.prenotazioneId));
      });
      maturate++;
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
    const [u] = await tx.select({ credito: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.id, utenteId)).limit(1);
    const disponibile = u ? Number(u.credito) : 0;
    if (importo > disponibile) throw new ConflittoDati('Il credito disponibile è cambiato — riprova.');

    await tx.insert(movimentiCredito).values({
      utenteId,
      importo: (-importo).toFixed(2),
      motivo: `Usato su prenotazione — PNR ${pnr}`,
      prenotazioneId,
    });
    await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} - ${importo.toFixed(2)}` }).where(eq(utenti.id, utenteId));
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
      await tx.insert(movimentiCredito).values({
        utenteId: amico.invitatoDa!,
        importo: importo.toFixed(2),
        motivo: `Amico invitato${amico.nome ? ` (${amico.nome})` : ''} — prima prenotazione confermata`,
      });
      await tx.update(utenti).set({ creditoDisponibile: sql`${utenti.creditoDisponibile} + ${importo.toFixed(2)}` }).where(eq(utenti.id, amico.invitatoDa!));
      await tx.update(utenti).set({ bonusReferralInvitanteErogato: true }).where(eq(utenti.id, p.utenteId));
    });
  },
};
