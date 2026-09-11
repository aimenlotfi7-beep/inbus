import { ErroreApi } from '../../api/client';

/** Il perché di un errore, da mettere dopo "… non riuscito: ". Il testo
 *  del server se c'è, senza il dettaglio tecnico dei campi (il server
 *  risponde "Dati non validi: {"postiBus":[…]}", illeggibile per chi
 *  usa il gestionale); per un problema di rete, un motivo comprensibile.
 *  Stesso formato ovunque: "Salvataggio non riuscito: <motivo>". */
export function motivoErrore(e: unknown): string {
  if (e instanceof ErroreApi) {
    if (e.message.startsWith('Dati non validi')) return 'alcuni dati non sono validi, controlla i campi compilati.';
    return e.message;
  }
  return 'impossibile contattare il server.';
}

/** Stesso messaggio per ogni problema di rete verso OpenStreetMap
 *  (ricerca indirizzi, distanze, tempi di viaggio). */
export const ERRORE_MAPPE = 'Impossibile contattare il servizio mappe (OpenStreetMap): controlla la connessione e riprova.';
