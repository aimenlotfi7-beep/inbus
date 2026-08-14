import type { ReactNode } from 'react';

export function Modale({ titolo, onClose, children, larga }: { titolo: string; onClose: () => void; children: ReactNode; larga?: boolean }) {
  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className={`modal${larga ? ' modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>{titolo}</h3>
        {children}
      </div>
    </div>
  );
}
