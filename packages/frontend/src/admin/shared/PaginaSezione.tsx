import type { ReactNode } from 'react';
import { InfoTooltip } from './InfoTooltip';

/**
 * Sostituisce la Modale per le schede di modifica/dettaglio: invece di
 * comparire come popup sopra l'elenco, occupa tutta l'area di lavoro.
 * "← Indietro" richiama `onIndietro` (di solito: torna a mostrare
 * l'elenco della stessa sezione in cui si era, senza vera navigazione a
 * URL — lo schermo intero è solo una questione di layout).
 */
export function PaginaSezione({
  titolo, onIndietro, azioni, children, richiediConferma, larga, info,
}: {
  titolo: string;
  onIndietro: () => void;
  azioni?: ReactNode;
  children: ReactNode;
  // Se presente, viene chiamata al posto di onIndietro: decide lei se
  // tornare indietro davvero (es. chiede conferma se ci sono modifiche
  // non salvate).
  richiediConferma?: () => void;
  // Contenuti con tabelle/riepiloghi affiancati (es. Partenze) stanno
  // più larghi di un modulo normale — di default resta stretto (760px,
  // più leggibile per moduli/testo), qui si allarga a 1100px.
  larga?: boolean;
  // Stesso "info" già su PanelHead — un'icona (i) di fianco al titolo,
  // col testo del tooltip già risolto (personalizzato o di default).
  info?: ReactNode;
}) {
  const indietro = richiediConferma ?? onIndietro;
  return (
    <div className="pagina-sezione">
      <div className="pagina-sezione-head">
        <button className="btn btn-ghost pagina-sezione-indietro" onClick={indietro}>← Indietro</button>
        <h2>{titolo}{info && <InfoTooltip>{info}</InfoTooltip>}</h2>
        {azioni && <div className="pagina-sezione-azioni">{azioni}</div>}
      </div>
      <div className={`pagina-sezione-corpo${larga ? ' larga' : ''}`}>{children}</div>
    </div>
  );
}
