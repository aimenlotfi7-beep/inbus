import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, tragitti } from '../../db/schema.js';
import { leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';

/** La soglia di pareggio (% dei posti del bus) che vale per un tragitto
 *  (proprietario, ottobre 2026: «se un evento è molto popolare posso
 *  rischiare di più»): quella del tragitto, se c'è; altrimenti quella
 *  dell'evento; altrimenti quella di Impostazioni, che resta la regola per
 *  tutti gli altri. Decide i posti di pareggio ovunque: proposte dei bus,
 *  contatore, prezzi calcolati, Statistiche. */

export type FonteSoglia = 'tragitto' | 'evento' | 'generale';

const valida = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100;

export function risolviSoglia(propria: { tragitto?: number | null; evento?: number | null }, generale: number): { valore: number; fonte: FonteSoglia } {
  if (valida(propria.tragitto)) return { valore: propria.tragitto, fonte: 'tragitto' };
  if (valida(propria.evento)) return { valore: propria.evento, fonte: 'evento' };
  return { valore: generale, fonte: 'generale' };
}

/** Solo la parte propria (tragitto, poi evento): null = vale Impostazioni. */
export function sogliaPropria(propria: { tragitto?: number | null; evento?: number | null }): number | null {
  if (valida(propria.tragitto)) return propria.tragitto;
  if (valida(propria.evento)) return propria.evento;
  return null;
}

/** La soglia di un tragitto letta dal database. */
export async function sogliaDelTragitto(tragittoId: string, generale?: number): Promise<{ valore: number; fonte: FonteSoglia }> {
  const [riga] = await db.select({ tragitto: tragitti.sogliaPareggio, evento: eventi.sogliaPareggio })
    .from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId)).where(eq(tragitti.id, tragittoId)).limit(1);
  return risolviSoglia(riga ?? {}, generale ?? await leggiSogliaOccupazionePareggio());
}
