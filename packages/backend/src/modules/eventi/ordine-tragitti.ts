import { asc } from 'drizzle-orm';
import { tragitti } from '../../db/schema.js';

/** L'ordine dei tragitti di un evento ovunque compaiano (scheda evento,
 *  Partenze, Statistiche, Bus in più): quello della scheda, a parità il nome.
 *  Senza, il database li restituiva come capitava e l'ordine cambiava dopo
 *  ogni modifica (proprietario, ottobre 2026). */
export const ORDINE_TRAGITTI = [asc(tragitti.ordine), asc(tragitti.nome), asc(tragitti.id)];
