import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { offerteApi } from '../api/offerte';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento } from '../api/prezzi';
import type { OffertaCheckout } from '../features/checkout/CheckoutForm';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { useSeoTags } from '../features/useSeoTags';
import { Layout } from '../Layout';

type Stato = 'caricamento' | 'pronto' | 'non-trovata';

export function OffertaPage() {
  const { slug } = useParams<{ slug: string }>();
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

  const prezzoMinimo = evento ? prezzoMinimoEvento(evento) : null;
  const copertina = evento?.immagini[0]?.url;

  useSeoTags({
    title: evento && offerta ? `${evento.artista} — ${offerta.nome} | INBUS` : 'Offerta | INBUS',
    description: evento && offerta
      ? `Offerta speciale "${offerta.nome}": -${offerta.scontoPercentuale.toFixed(0)}% sul bus per ${evento.artista} a ${evento.citta}. Prenota il tuo posto con INBUS.`
      : 'Offerta speciale INBUS.',
    image: copertina,
    url: window.location.href,
  });

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: '40px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico l'offerta...</p>}

        {stato === 'non-trovata' && (
          <div className="checkout-summary">
            {errore} Puoi comunque vedere tutti gli eventi disponibili in <a href="/">home page</a>.
          </div>
        )}

        {stato === 'pronto' && evento && offerta && (
          <div className="checkout-modal-wide" style={{ background: 'transparent', maxWidth: 'none' }}>
            <div className="checkout-columns" style={{ maxHeight: 'none', borderRadius: 18, overflow: 'hidden' }}>
              <div className="checkout-col-info" style={{ maxHeight: 'none' }}>
                <div className="checkout-cover" style={copertina ? { backgroundImage: `url(${copertina})` } : undefined} />
                <span className="tag">🎉 {offerta.nome}</span>
                <h2>{evento.artista}</h2>
                <p className="meta-info">{evento.luogo}, {evento.citta}</p>
                <p className="meta-info">{new Date(evento.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p style={{ background: 'rgba(91,224,160,.15)', border: '1px solid rgba(91,224,160,.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, display: 'inline-block', marginTop: 12 }}>
                  -{offerta.scontoPercentuale.toFixed(0)}% su tutte le fermate
                </p>
                {prezzoMinimo !== null && (
                  <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, marginTop: 14 }}>
                    da €{(prezzoMinimo * (1 - offerta.scontoPercentuale / 100)).toFixed(2)}
                    <span style={{ fontSize: 12, opacity: .7 }}> invece di €{prezzoMinimo.toFixed(2)}</span>
                  </p>
                )}
              </div>
              <div className="checkout-col-form" style={{ maxHeight: 'none' }}>
                <CheckoutForm evento={evento} offerta={offerta} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
