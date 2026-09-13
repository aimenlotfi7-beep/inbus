import { db } from '../db/client.js';
import { logAttivita } from '../db/schema.js';

/** Un'email automatica al cliente (conferma, biglietto, saldo) non è
 *  partita: oltre ai log del server resta scritta nel registro attività del
 *  gestionale (Amministratori → Log attività recenti), così qualcuno la vede
 *  e può avvisare il cliente. Non lancia mai. */
export async function segnalaEmailNonPartita(cosa: string, pnr: string, email: string | null | undefined) {
  console.error(`[email] ${cosa} non partita (PNR ${pnr}${email ? `, a ${email}` : ''}).`);
  try {
    await db.insert(logAttivita).values({ amministratoreId: null, azione: 'Email non partita', dettaglio: `${cosa} — PNR ${pnr}${email ? `, a ${email}` : ''}` });
  } catch (err) {
    console.error('[email] registro attività non aggiornato:', err);
  }
}
