import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, movimentiCredito, partecipantiPrenotazione } from '../../db/schema.js';
import { leggiCreditoPerPasseggero } from '../impostazioni/impostazioni.routes.js';
import { ConflittoDati } from '../../shared/errors.js';

export const creditoService = {
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
};
