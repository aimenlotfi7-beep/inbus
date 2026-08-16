import type { ReactNode } from 'react';

export function Modale({
  titolo, onClose, children, larga, richiediConferma,
}: {
  titolo: string;
  onClose: () => void;
  children: ReactNode;
  larga?: boolean;
  // Se presente, viene chiamata al posto di onClose quando l'utente
  // clicca fuori o sulla ✕: decide lei se chiudere davvero (es. chiede
  // conferma se ci sono modifiche non salvate) invece di chiudere sempre
  // subito perdendo eventuali dati non salvati.
  richiediConferma?: () => void;
}) {
  const chiudi = richiediConferma ?? onClose;
  return (
    <div className="modal-overlay show" onClick={chiudi}>
      <div className={`modal${larga ? ' modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={chiudi}>✕</button>
        <h3>{titolo}</h3>
        {children}
      </div>
    </div>
  );
}
