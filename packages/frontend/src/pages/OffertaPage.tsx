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
    jsonLd: evento && offerta ? {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: evento.artista,
      startDate: evento.data,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: evento.luogo, address: { '@type': 'PostalAddress', addressLocality: evento.citta, addressCountry: 'IT' } },
      ...(copertina && { image: [copertina] }),
      ...(prezzoMinimo !== null && {
        offers: { '@type': 'Offer', price: (prezzoMinimo * (1 - offerta.scontoPercentuale / 100)).toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: window.location.href },
      }),
    } : undefined,
  });

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico l'offerta...</p>}

        {stato === 'non-trovata' && (
          <div className="checkout-summary">
            {errore} Puoi comunque vedere tutti gli eventi disponibili in <a href="/">home page</a>.
          </div>
        )}

        {stato === 'pronto' && evento && offerta && (
          <div className="evento-pagina-corpo">
            <div className="evento-pagina-info">
              <div className={`evento-pagina-hero${copertina ? '' : ' senza-foto'}`} style={copertina ? { backgroundImage: `url(${copertina})` } : undefined}>
                <span className="tag">🎉 {offerta.nome}</span>
              </div>

              <h1>{evento.artista}</h1>
              <p className="meta-riga">📍 {evento.luogo}, {evento.citta}</p>
              <p className="meta-riga">📅 {new Date(evento.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

              <p style={{ background: 'rgba(91,224,160,.15)', border: '1px solid rgba(91,224,160,.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, display: 'inline-block', marginTop: 10 }}>
                -{offerta.scontoPercentuale.toFixed(0)}% su tutte le fermate
              </p>

              {prezzoMinimo !== null && (
                <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, marginTop: 14 }}>
                  da €{(prezzoMinimo * (1 - offerta.scontoPercentuale / 100)).toFixed(2)}
                  <span style={{ fontSize: 13, opacity: .7 }}> invece di €{prezzoMinimo.toFixed(2)}</span>
                </p>
              )}

              {evento.descrizione && (
                <div className="sezione-info">
                  <h4>Informazioni</h4>
                  {evento.descrizione}
                </div>
              )}

              {evento.immagini.length > 1 && (
                <div className="galleria">
                  {evento.immagini.slice(1).map((img) => (
                    <img key={img.id} src={img.url} alt={`${evento.artista} — foto`} loading="lazy" />
                  ))}
                </div>
              )}
            </div>

            <div className="evento-pagina-checkout">
              <CheckoutForm evento={evento} offerta={offerta} />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
