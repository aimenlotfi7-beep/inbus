import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { offerteApi } from '../api/offerte';
import type { Evento } from '../api/types';
import type { OffertaCheckout } from '../features/checkout/CheckoutModal';
import { CheckoutModal } from '../features/checkout/CheckoutModal';

type Stato = 'caricamento' | 'pronto' | 'non-trovata';

export function OffertaPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [evento, setEvento] = useState<Evento | null>(null);
  const [offerta, setOfferta] = useState<OffertaCheckout | null>(null);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!slug) return;
    offerteApi.getBySlug(slug)
      .then((r) => {
        setEvento(r.evento);
        setOfferta({ id: r.offerta.id, nome: r.offerta.nome, scontoPercentuale: Number(r.offerta.scontoPercentuale) });
        setStato('pronto');
      })
      .catch((e) => {
        setErrore(e?.message || "Questo link non è (più) valido.");
        setStato('non-trovata');
      });
  }, [slug]);

  return (
    <>
      <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico l'offerta...</p>}
        {stato === 'non-trovata' && (
          <div className="checkout-summary">
            {errore} Puoi comunque vedere tutti gli eventi disponibili in <a href="/">home page</a>.
          </div>
        )}
      </div>

      {stato === 'pronto' && evento && offerta && (
        <CheckoutModal evento={evento} offerta={offerta} onClose={() => navigate('/')} />
      )}
    </>
  );
}
