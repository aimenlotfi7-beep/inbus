import { useEffect } from 'react';
import { conferma } from './conferma';

/**
 * Avvisa l'utente prima di perdere modifiche non salvate:
 * - se prova a ricaricare/chiudere la scheda del browser (popup nativo,
 *   l'unico che il browser permette in quel momento)
 * - se prova a chiudere una pagina o una modale (tramite la funzione
 *   `chiediConferma` restituita, da passare al posto di chiudere
 *   direttamente): stessa finestra di conferma del resto del gestionale
 *
 * `modificato` va calcolato dal chiamante (es. confrontando lo stato del
 * form con un suo snapshot iniziale).
 */
export function useAvvisoModificheNonSalvate(modificato: boolean) {
  useEffect(() => {
    if (!modificato) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [modificato]);

  function chiediConferma(onConfermato: () => void) {
    if (!modificato) { onConfermato(); return; }
    conferma({
      titolo: 'Uscire senza salvare?',
      testo: 'Hai modifiche non salvate: se esci adesso andranno perse.',
      conferma: 'Esci senza salvare',
      annulla: 'Resta qui',
      pericolosa: true,
    }).then((ok) => { if (ok) onConfermato(); });
  }

  return chiediConferma;
}
