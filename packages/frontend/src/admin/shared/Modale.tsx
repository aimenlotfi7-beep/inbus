import type { ReactNode } from 'react';

export function Modale({ titolo, onClose, children }: { titolo: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>{titolo}</h3>
        {children}
      </div>
    </div>
  );
}
