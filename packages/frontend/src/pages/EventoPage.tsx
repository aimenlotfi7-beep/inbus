import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento } from '../api/prezzi';
import { useSeoTags } from '../features/useSeoTags';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { Layout } from '../Layout';

const ETICHETTA_STATO: Record<NonNullable<Evento['statoDisponibilita']>, string> = {
  POCHI_POSTI: 'Pochi posti disponibili',
  NUOVI_POSTI: 'Nuovi posti disponibili',
  ESAURITO: 'Posti terminati',
};

type Stato = 'caricamento' | 'pronto' | 'non-trovato';

/** Pagina propria per ogni evento — indicizzabile da Google e
 *  condivisibile con un'anteprima specifica (titolo, immagine, prezzo).
 *  Foto grande in alto, informazioni sotto, modulo di prenotazione a
 *  parte (a destra su schermi larghi) — niente popup da aprire. */
export function EventoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [evento, setEvento] = useState<Evento | null>(null);

  useEffect(() => {
    if (!slug) return;
    setStato('caricamento');
    eventiApi.getBySlug(slug)
      .then((e) => { setEvento(e); setStato('pronto'); })
      .catch(() => setStato('non-trovato'));
  }, [slug]);

  const prezzoMinimo = evento ? prezzoMinimoEvento(evento) : null;
  const copertina = evento?.immagini[0]?.url;

  useSeoTags({
    title: evento ? `${evento.artista} — ${evento.luogo}, ${evento.citta} | INBUS` : 'Evento | INBUS',
    description: evento
      ? `Bus per ${evento.artista} il ${new Date(evento.data).toLocaleDateString('it-IT')} a ${evento.citta}${prezzoMinimo !== null ? ` — a partire da €${prezzoMinimo.toFixed(2)}` : ''}. Prenota il tuo posto con INBUS.`
      : 'Prenota il tuo bus per l\'evento con INBUS.',
    image: copertina,
    url: window.location.href,
    jsonLd: evento ? {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: evento.artista,
      startDate: evento.data,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: evento.luogo, address: { '@type': 'PostalAddress', addressLocality: evento.citta, addressCountry: 'IT' } },
      ...(copertina && { image: [copertina] }),
      ...(prezzoMinimo !== null && {
        offers: { '@type': 'Offer', price: prezzoMinimo.toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: window.location.href },
      }),
    } : undefined,
  });

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">
            Questo evento non è (più) disponibile. Puoi vedere tutti gli eventi in <a href="/">home page</a>.
          </div>
        )}

        {stato === 'pronto' && evento && (
          <>
            <div className={`evento-pagina-hero${copertina ? '' : ' senza-foto'}`} style={copertina ? { backgroundImage: `url(${copertina})` } : undefined}>
              <span className="tag">{evento.genere}</span>
            </div>

            <div className="evento-pagina-corpo">
              <div className="evento-pagina-info">
                <h1>{evento.artista}</h1>
                <p className="meta-riga">📍 {evento.luogo}, {evento.citta}</p>
                <p className="meta-riga">📅 {new Date(evento.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

                {evento.statoDisponibilita && (
                  <p style={{ background: 'rgba(255,180,80,.15)', border: '1px solid rgba(255,180,80,.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, display: 'inline-block', marginTop: 12 }}>
                    {ETICHETTA_STATO[evento.statoDisponibilita]}
                  </p>
                )}

                {prezzoMinimo !== null && (
                  <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 24, marginTop: 18 }}>da €{prezzoMinimo.toFixed(2)} <span style={{ fontSize: 13, opacity: .7 }}>/persona</span></p>
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
                <CheckoutForm evento={evento} />
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
