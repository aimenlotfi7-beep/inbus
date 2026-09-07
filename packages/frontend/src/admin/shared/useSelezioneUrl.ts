import { useState } from 'react';
import { useNavigazione } from './NavigazioneContext';
import type { SezioneGestionale } from './AdminLayout';

/** L'elemento aperto (quale evento, quale fornitore, ...) sopravvive a
 *  un ricaricamento della pagina — prima si perdeva sempre, tornando
 *  all'elenco della sezione. Stesso meccanismo già usato da Linee
 *  (?evento=&tragitto=), qui generalizzato: la chiave passata (es.
 *  "eventoId") viene scritta nell'URL quando si apre un elemento,
 *  tolta quando si chiude, e letta all'avvio per riaprirlo da sola. */
export function useSelezioneUrl(sezione: SezioneGestionale, chiave: string) {
  const naviga = useNavigazione();
  const [id, setId] = useState<string | null>(() => new URLSearchParams(window.location.search).get(chiave));

  function apri(nuovoId: string) {
    setId(nuovoId);
    naviga(sezione, { [chiave]: nuovoId });
  }
  function chiudi() {
    setId(null);
    naviga(sezione, { [chiave]: null });
  }

  return { id, apri, chiudi };
}
