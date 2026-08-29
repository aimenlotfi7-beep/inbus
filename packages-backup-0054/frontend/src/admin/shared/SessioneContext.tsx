import { createContext, useContext } from 'react';
import type { SessioneAdmin } from '../../api/auth';

/**
 * Rende la sessione dell'amministratore loggato disponibile a qualunque
 * componente dentro il gestionale, senza doverla passare a mano schermata
 * per schermata (prop drilling) — utile ovunque serva controllare un
 * permesso specifico più in profondità nell'albero, come dentro le tab
 * di un evento (es. Partenze → dati economici).
 */
export const SessioneContext = createContext<SessioneAdmin | null>(null);

export function useSessione() {
  return useContext(SessioneContext);
}
