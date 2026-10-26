import { and, eq, sql, type SQL } from 'drizzle-orm';
import { eventi, tourEventi } from '../../db/schema.js';
import { stessoNome } from '../../shared/nomi.js';

/** I filtri delle Statistiche oltre al periodo (proprietario, ottobre 2026:
 *  «poter filtrare per evento, per categorie»): categoria, genere, città
 *  dell'evento, tour e un evento solo. Valgono per tutte le schede; i nomi si
 *  confrontano senza maiuscole né spazi ai lati («Rock» = «rock»). */
export interface FiltroEventi {
  categoria?: string;
  genere?: string;
  citta?: string;
  tourId?: string;
  eventoId?: string;
}

/** Il valore del filtro Categoria per gli eventi che non ne hanno una. */
export const SENZA_CATEGORIA = '__senza__';

/** La condizione sugli eventi, da mettere in una query che legge la tabella
 *  eventi (anche con un join). undefined senza filtri. */
export function condizioneEventi(f: FiltroEventi): SQL | undefined {
  const parti: SQL[] = [];
  if (f.categoria) {
    parti.push(f.categoria === SENZA_CATEGORIA
      ? sql`coalesce(trim(${eventi.categoria}), '') = ''`
      : stessoNome(eventi.categoria, f.categoria));
  }
  if (f.genere) parti.push(stessoNome(eventi.genere, f.genere));
  if (f.citta) parti.push(stessoNome(eventi.citta, f.citta));
  if (f.tourId) {
    parti.push(sql`exists (select 1 from ${tourEventi} where ${tourEventi.tourId} = ${f.tourId} and ${tourEventi.eventoId} = ${eventi.id})`);
  }
  if (f.eventoId) parti.push(eq(eventi.id, f.eventoId));
  return parti.length ? and(...parti) : undefined;
}

export const conFiltri = (f: FiltroEventi) => Boolean(f.categoria || f.genere || f.citta || f.tourId || f.eventoId);
