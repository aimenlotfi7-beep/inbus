import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/** Generi e categorie degli eventi: «Rock», «rock» e « Rock » sono lo stesso
 *  nome (proprietario, ottobre 2026). Spazi ai lati e maiuscole non contano:
 *  nei generi del menu, nei filtri del sito e nei raggruppamenti delle
 *  Statistiche. */
export const chiaveNome = (nome: string | null | undefined) => (nome ?? '').trim().toLowerCase();

/** La stessa regola dentro una query: colonna e nome confrontati senza spazi ai lati né maiuscole. */
export const stessoNome = (colonna: SQLWrapper, nome: string): SQL =>
  sql`lower(trim(${colonna})) = ${chiaveNome(nome)}`;

/** La chiave di raggruppamento di una colonna (stessa regola di chiaveNome). */
export const chiaveNomeSql = (colonna: SQLWrapper): SQL<string> => sql<string>`lower(trim(${colonna}))`;
