import { useEffect, useId, type ReactNode } from 'react';

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
  const idTitolo = useId();

  // Stesso comportamento del click sulla ✕ — chi naviga solo da
  // tastiera prima non aveva alcun modo di chiudere il modale.
  useEffect(() => {
    function allaPressione(e: KeyboardEvent) {
      if (e.key === 'Escape') chiudi();
    }
    window.addEventListener('keydown', allaPressione);
    return () => window.removeEventListener('keydown', allaPressione);
  }, [chiudi]);

  return (
    <div className="modal-overlay show" onClick={chiudi}>
      <div className={`modal${larga ? ' modal-wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={idTitolo}>
        <button className="modal-close" onClick={chiudi} aria-label="Chiudi">✕</button>
        <h3 id={idTitolo}>{titolo}</h3>
        {children}
      </div>
    </div>
  );
}
