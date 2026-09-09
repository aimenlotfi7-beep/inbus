import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tourApi, type TourPubblico } from '../api/tour';
import { useSeoTags } from '../features/useSeoTags';
import { Layout } from '../Layout';

/** Pagina di un Tour (più date dello stesso spettacolo): copertina e
 *  nome a sinistra come per un evento, a destra le date a scorrimento
 *  verticale (confermato in conversazione: niente calendario a
 *  griglia). Ogni data porta DIRETTAMENTE alla sua pagina evento
 *  normale — nessun flusso di prenotazione qui dentro, è solo un
 *  indice. */
export function TourPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tour, setTour] = useState<TourPubblico | null>(null);
  const [stato, setStato] = useState<'caricamento' | 'pronto' | 'non-trovato'>('caricamento');

  useEffect(() => {
    if (!slug) return;
    tourApi.dettaglioPubblico(slug).then((t) => { setTour(t); setStato('pronto'); }).catch(() => setStato('non-trovato'));
  }, [slug]);

  useSeoTags({
    title: tour ? `${tour.nome} — OnWay` : 'Tour — OnWay',
    description: tour ? (tour.descrizione?.trim() || `${tour.eventi.length} date disponibili per ${tour.nome}.`) : 'Più date, un solo spettacolo.',
    image: tour?.copertinaUrl ?? undefined,
    url: window.location.href,
  });

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}
        {stato === 'non-trovato' && (
          <div className="checkout-summary">Questo tour non è (più) disponibile. Vedi <Link to="/">tutti gli eventi</Link>.</div>
        )}

        {stato === 'pronto' && tour && (
          <div className="evento-pagina-corpo">
            <div className="evento-pagina-info">
              <div className={`evento-pagina-hero${tour.copertinaUrl ? '' : ' senza-foto'}`} style={tour.copertinaUrl ? { backgroundImage: `url(${tour.copertinaUrl})` } : undefined}>
                <span className="tag">{tour.eventi.length} date</span>
              </div>
              <h1>{tour.nome}</h1>
              <p className="meta-riga">Scegli la data che preferisci — la prenotazione funziona come per un evento normale.</p>
              {tour.descrizione && <p style={{ marginTop: 14, whiteSpace: 'pre-line' }}>{tour.descrizione}</p>}
            </div>

            <div className="evento-pagina-checkout aperta-mobile">
              <div className="checkout-form" style={{ maxHeight: 640, overflowY: 'auto' }}>
                <h3 style={{ marginBottom: 12 }}>Tutte le date</h3>
                {tour.eventi.length === 0 && <p className="testo-intro">Nessuna data disponibile al momento.</p>}
                {tour.eventi.map((d) => (
                  <Link
                    key={d.id}
                    to={`/eventi/${d.slug}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                      padding: '14px 12px', borderBottom: '1px solid var(--line)', color: 'inherit', textDecoration: 'none',
                    }}
                  >
                    <span>
                      <b style={{ display: 'block', fontSize: 15 }}>
                        {new Date(d.data).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}
                      </b>
                      <span style={{ fontSize: 13, color: 'var(--mist)' }}>{d.luogo}, {d.citta}</span>
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      {!d.vendibile ? (
                        <span style={{ fontSize: 12.5, color: 'var(--pink)' }}>Non disponibile</span>
                      ) : (
                        <>
                          {d.prezzoMinimo !== null && <span style={{ display: 'block', fontWeight: 700 }}>da €{d.prezzoMinimo.toFixed(0)}</span>}
                          <span className="card-cta" style={{ fontSize: 13 }}>Prenota</span>
                        </>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
