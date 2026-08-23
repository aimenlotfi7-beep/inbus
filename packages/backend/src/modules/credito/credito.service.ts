import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, movimentiCredito, partecipantiPrenotazione } from '../../db/schema.js';
import { leggiCreditoPerPasseggero } from '../impostazioni/impostazioni.routes.js';
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

  /** Lo storico completo dei movimenti — usato per la sezione dedicata
   *  nell'area cliente, separata in maturato (guadagnato) e utilizzato
   *  (speso), invece del solo saldo attuale. */
  async storicoMovimenti(email: string) {
    const [u] = await db.select({ id: utenti.id }).from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    if (!u) return [];
    return db.select().from(movimentiCredito).where(eq(movimentiCredito.utenteId, u.id)).orderBy(desc(movimentiCredito.creatoIl));
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
};
