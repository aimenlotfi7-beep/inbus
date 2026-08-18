import type { Evento } from '../../api/types';
import { CheckoutForm, type OffertaCheckout } from './CheckoutForm';

export type { OffertaCheckout } from './CheckoutForm';

/** Popup di prenotazione — usato dalla home, dove gli eventi restano
 *  elencati sulla stessa pagina. Le pagine dedicate (evento/offerta)
 *  usano invece CheckoutForm direttamente, senza popup. */
export function CheckoutModal({ evento, offerta, onClose }: { evento: Evento; offerta?: OffertaCheckout; onClose: () => void }) {
  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <CheckoutForm evento={evento} offerta={offerta} onChiudi={onClose} />
      </div>
    </div>
  );
}
