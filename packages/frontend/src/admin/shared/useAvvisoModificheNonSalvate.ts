import { useEffect } from 'react';

/**
 * Avvisa l'utente prima di perdere modifiche non salvate:
 * - se prova a ricaricare/chiudere la scheda del browser (popup nativo)
 * - se prova a chiudere una modale (tramite la funzione `chiediConferma`
 *   restituita, da passare alla modale al posto di chiudere direttamente)
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
    if (modificato && !window.confirm('Hai modifiche non salvate. Vuoi uscire senza salvare?')) return;
    onConfermato();
  }

  return chiediConferma;
}
