import { useEffect, useId } from 'react';
import type { Evento } from '../../api/types';
import { CheckoutForm, type OffertaCheckout } from './CheckoutForm';

export type { OffertaCheckout } from './CheckoutForm';

/** Popup di prenotazione — usato dalla home, dove gli eventi restano
 *  elencati sulla stessa pagina. Le pagine dedicate (evento/offerta)
 *  usano invece CheckoutForm direttamente, senza popup. */
export function CheckoutModal({ evento, offerta, onClose }: { evento: Evento; offerta?: OffertaCheckout; onClose: () => void }) {
  const idTitolo = useId();

  // Chi naviga solo da tastiera prima non aveva alcun modo di chiudere
  // il popup — stesso comportamento del tasto ✕.
  useEffect(() => {
    function allaPressione(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', allaPressione);
    return () => window.removeEventListener('keydown', allaPressione);
  }, [onClose]);

  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={idTitolo}>
        <button className="modal-close" onClick={onClose} aria-label="Chiudi">✕</button>
        <h2 id={idTitolo} className="sr-only">Prenota {evento.artista}</h2>
        <CheckoutForm evento={evento} offerta={offerta} onChiudi={onClose} />
      </div>
    </div>
  );
}
