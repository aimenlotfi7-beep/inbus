import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento } from '../api/prezzi';
import { useSeoTags } from '../features/useSeoTags';
import { CheckoutModal } from '../features/checkout/CheckoutModal';
import { Layout } from '../Layout';

const ETICHETTA_STATO: Record<NonNullable<Evento['statoDisponibilita']>, string> = {
  POCHI_POSTI: 'Pochi posti disponibili',
  NUOVI_POSTI: 'Nuovi posti disponibili',
  ESAURITO: 'Posti terminati',
};

type Stato = 'caricamento' | 'pronto' | 'non-trovato';

/** Pagina propria per ogni evento — indicizzabile da Google e
 *  condivisibile con un'anteprima specifica (titolo, immagine, prezzo),
 *  invece di vivere solo dentro un popup nella home. */
export function EventoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [evento, setEvento] = useState<Evento | null>(null);
  const [checkoutAperto, setCheckoutAperto] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setStato('caricamento');
    eventiApi.getBySlug(slug)
      .then((e) => { setEvento(e); setStato('pronto'); })
      .catch(() => setStato('non-trovato'));
  }, [slug]);

  const prezzoMinimo = evento ? prezzoMinimoEvento(evento) : null;
  const posti = evento ? evento.linee.reduce((s, l) => s + l.postiDisponibili, 0) : 0;
  const copertina = evento?.immagini[0]?.url;

  useSeoTags({
    title: evento ? `${evento.artista} — ${evento.luogo}, ${evento.citta} | INBUS` : 'Evento | INBUS',
    description: evento
      ? `Bus per ${evento.artista} il ${new Date(evento.data).toLocaleDateString('it-IT')} a ${evento.citta}${prezzoMinimo !== null ? ` — a partire da €${prezzoMinimo.toFixed(2)}` : ''}. Prenota il tuo posto con INBUS.`
      : 'Prenota il tuo bus per l\'evento con INBUS.',
    image: copertina,
    url: window.location.href,
  });

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: '40px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">
            Questo evento non è (più) disponibile. Puoi vedere tutti gli eventi in <a href="/">home page</a>.
          </div>
        )}

        {stato === 'pronto' && evento && (
          <>
            {copertina && (
              <img src={copertina} alt={`${evento.artista} — ${evento.luogo}, ${evento.citta}`} style={{ width: '100%', borderRadius: 18, marginBottom: 24, maxHeight: 420, objectFit: 'cover' }} />
            )}
            <span className="tag" style={{ position: 'static', display: 'inline-block', marginBottom: 10 }}>{evento.genere}</span>
            <h1 style={{ fontFamily: "'Anton',sans-serif", textTransform: 'uppercase', fontSize: 36, margin: '0 0 10px' }}>{evento.artista}</h1>
            <p style={{ fontSize: 16, opacity: .85, marginBottom: 4 }}>{evento.luogo}, {evento.citta}</p>
            <p style={{ fontSize: 16, opacity: .85, marginBottom: 18 }}>{new Date(evento.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

            {evento.statoDisponibilita && (
              <p style={{ background: '#fff4e0', border: '1px solid #f0d9a8', borderRadius: 8, padding: '8px 12px', fontSize: 13, display: 'inline-block', marginBottom: 18 }}>
                {ETICHETTA_STATO[evento.statoDisponibilita]}
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 20 }}>
              <div className="price" style={{ fontSize: 20 }}>
                {prezzoMinimo !== null ? <>da €{prezzoMinimo.toFixed(2)}<span> /persona</span></> : <span>Prezzo da definire</span>}
              </div>
              <button className="search-cta" style={{ width: 'auto', margin: 0, padding: '14px 28px' }} onClick={() => setCheckoutAperto(true)}>
                {posti === 0 ? "Iscriviti alla lista d'attesa" : 'Prenota ora'}
              </button>
            </div>

            {evento.immagini.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 32 }}>
                {evento.immagini.slice(1).map((img) => (
                  <img key={img.id} src={img.url} alt={`${evento.artista} — foto`} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10 }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {evento && checkoutAperto && (
        <CheckoutModal evento={evento} onClose={() => setCheckoutAperto(false)} />
      )}
    </Layout>
  );
}
