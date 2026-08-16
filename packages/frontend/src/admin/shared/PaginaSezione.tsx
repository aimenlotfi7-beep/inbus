import type { ReactNode } from 'react';

/**
 * Sostituisce la Modale per le schede di modifica/dettaglio: invece di
 * comparire come popup sopra l'elenco, occupa tutta l'area di lavoro.
 * "← Indietro" richiama `onIndietro` (di solito: torna a mostrare
 * l'elenco della stessa sezione in cui si era, senza vera navigazione a
 * URL — lo schermo intero è solo una questione di layout).
 */
export function PaginaSezione({
  titolo, onIndietro, azioni, children, richiediConferma,
}: {
  titolo: string;
  onIndietro: () => void;
  azioni?: ReactNode;
  children: ReactNode;
  // Se presente, viene chiamata al posto di onIndietro: decide lei se
  // tornare indietro davvero (es. chiede conferma se ci sono modifiche
  // non salvate).
  richiediConferma?: () => void;
}) {
  const indietro = richiediConferma ?? onIndietro;
  return (
    <div className="pagina-sezione">
      <div className="pagina-sezione-head">
        <button className="btn btn-ghost pagina-sezione-indietro" onClick={indietro}>← Indietro</button>
        <h2>{titolo}</h2>
        {azioni && <div className="pagina-sezione-azioni">{azioni}</div>}
      </div>
      <div className="pagina-sezione-corpo">{children}</div>
    </div>
  );
}
