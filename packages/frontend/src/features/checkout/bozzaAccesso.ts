/** La prenotazione in corso mentre il cliente passa da "Accedi" o
 *  "Registrati": salvata nella scheda del browser (sessionStorage) e letta
 *  una volta sola al ritorno sulla stessa pagina. Prima si perdevano
 *  fermata, passeggeri e nomi, anche se il modulo prometteva il contrario. */
const CHIAVE = 'onway_bozza_checkout';
const VALIDITA_MS = 60 * 60 * 1000;

export interface BozzaAccesso {
  eventoId: string;
  servizioId: string | null;
  fermataId: string;
  passeggeri: number;
  partecipanti: { nome: string; cognome: string }[];
}

export function salvaBozzaAccesso(bozza: BozzaAccesso) {
  try {
    sessionStorage.setItem(CHIAVE, JSON.stringify({ ...bozza, salvataIl: Date.now() }));
  } catch {
    // Archivio del browser non disponibile: si ricomincia dal primo passo, come prima.
  }
}

/** C'è una prenotazione in sospeso per questo evento? Senza toglierla: serve
 *  alla pagina per riaprire da sola il modulo (sui telefoni sta in un foglio chiuso). */
export function esisteBozzaAccesso(eventoId: string): boolean {
  try {
    const grezza = sessionStorage.getItem(CHIAVE);
    if (!grezza) return false;
    const bozza = JSON.parse(grezza) as { eventoId?: string; salvataIl?: number };
    return bozza.eventoId === eventoId && Date.now() - (bozza.salvataIl ?? 0) <= VALIDITA_MS;
  } catch {
    return false;
  }
}

/** La bozza di questo evento, se c'è ed è recente; viene tolta appena letta. */
export function leggiBozzaAccesso(eventoId: string): BozzaAccesso | null {
  try {
    const grezza = sessionStorage.getItem(CHIAVE);
    if (!grezza) return null;
    const bozza = JSON.parse(grezza) as BozzaAccesso & { salvataIl: number };
    if (bozza.eventoId !== eventoId) return null;
    sessionStorage.removeItem(CHIAVE);
    if (Date.now() - bozza.salvataIl > VALIDITA_MS) return null;
    if (!Number.isInteger(bozza.passeggeri) || bozza.passeggeri < 1 || !Array.isArray(bozza.partecipanti)) return null;
    return bozza;
  } catch {
    return null;
  }
}
