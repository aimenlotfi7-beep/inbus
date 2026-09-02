import { createContext, useContext } from 'react';
import type { SezioneGestionale } from './AdminLayout';

/**
 * Rende disponibile a qualunque componente dentro il gestionale (senza
 * doverla passare a mano schermata per schermata) la funzione VERA che
 * cambia sezione — quella che AdminApp usa già per il menu laterale
 * (aggiorna lo stato React e l'indirizzo con history.replaceState,
 * senza mai ricaricare la pagina).
 *
 * Prima di questo contesto, componenti in profondità nell'albero (es.
 * PartenzeTab, per saltare alla pagina Linee) usavano
 * `window.location.href` — una navigazione VERA del browser, che
 * ricarica tutto da zero (bundle JS, sessione, tutto) invece di un
 * semplice cambio di sezione interno: molto più lento, ed è la causa
 * vera del "lag" segnalato aprendo/lasciando quelle sezioni.
 *
 * `parametriExtra` imposta ulteriori parametri nell'indirizzo insieme
 * al cambio sezione (es. `evento`/`tragitto` per la pagina Linee) — un
 * valore `null` toglie quel parametro invece di impostarlo.
 */
export const NavigazioneContext = createContext<
  (sezione: SezioneGestionale, parametriExtra?: Record<string, string | null>) => void
>(() => {});

export function useNavigazione() {
  return useContext(NavigazioneContext);
}
