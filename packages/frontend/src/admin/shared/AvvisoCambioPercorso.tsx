import type { ReactNode } from 'react';
import { notifica } from './notifiche';
import type { CambioPercorso, StatoCambioPercorso } from '../../api/preventivi';

/** Il riquadro viola "percorso cambiato". Il viola è riservato ai
 *  preventivi da rifare perché le fermate sono cambiate dopo averlo
 *  accettato: più urgenti degli altri avvisi (rossi). Dice sempre cosa è
 *  cambiato e cosa fare adesso. Regole in backend preventivi/cambio-percorso.ts. */

const TITOLI: Record<StatoCambioPercorso, string> = {
  da_richiedere: 'Percorso cambiato: serve un nuovo preventivo',
  in_attesa: 'Percorso cambiato: nuovo preventivo richiesto',
  da_valutare: 'Percorso cambiato: nuove risposte da valutare',
};

const COSA_FARE: Record<StatoCambioPercorso, string> = {
  da_richiedere: 'chiedi un nuovo preventivo sul percorso aggiornato, oppure conferma che quello attuale va ancora bene.',
  in_attesa: "aspetta le risposte dei fornitori. Se tardano, reinvia la richiesta dall'elenco o chiedi ad altri fornitori.",
  da_valutare: 'confronta le risposte arrivate e accetta la migliore: il tragitto torna in regola.',
};

/** Etichetta corta per card e bollini: dice sempre che nasce da un cambio di percorso. */
export const ETICHETTA_CAMBIO_PERCORSO: Record<StatoCambioPercorso, string> = {
  da_richiedere: 'Percorso cambiato',
  in_attesa: 'Percorso cambiato · in attesa',
  da_valutare: 'Percorso cambiato · da valutare',
};

export function AvvisoCambioPercorso({ cambio, azioni }: { cambio: CambioPercorso; azioni?: ReactNode }) {
  const dettagli = [
    cambio.fermateTolte.length > 0 ? `Tolte: ${cambio.fermateTolte.join(', ')}.` : '',
    cambio.fermateAggiunte.length > 0 ? `Aggiunte: ${cambio.fermateAggiunte.join(', ')}.` : '',
    cambio.kmPreventivo != null && cambio.kmOra != null ? `Circa ${Math.round(cambio.kmPreventivo)} km nel preventivo, ${Math.round(cambio.kmOra)} km adesso.` : '',
  ].filter(Boolean).join(' ');
  return (
    <div className="avviso-percorso" role="alert">
      <p className="titolo">{TITOLI[cambio.stato]}</p>
      <p>Il preventivo accettato era stato fatto sul percorso di prima. {dettagli}</p>
      <p><b>Cosa fare:</b> {COSA_FARE[cambio.stato]}</p>
      {azioni && <div className="azioni">{azioni}</div>}
    </div>
  );
}

/** Subito dopo aver salvato le fermate: se il percorso di un tragitto con
 *  un preventivo accettato è cambiato, lo si dice in viola con l'azione da fare. */
export function notificaPercorsiCambiati(nomi: string[] | undefined) {
  if (!nomi?.length) return;
  const chi = nomi.length === 1 ? `Il percorso di "${nomi[0]}" è cambiato` : `Il percorso di ${nomi.length} tragitti è cambiato (${nomi.join(', ')})`;
  notifica(`${chi}: il preventivo accettato va rifatto. Lo trovi in viola in Partenze, Preventivi.`, 'urgente');
}
