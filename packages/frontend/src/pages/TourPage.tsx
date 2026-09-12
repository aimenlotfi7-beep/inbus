import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tourApi, type TourPubblico } from '../api/tour';
import { useSeoTags } from '../features/useSeoTags';
import { Layout } from '../Layout';
import { CardBase, formattaDataCard, inizialiDi } from '../features/eventi/EventoCard';
import { Icona } from '../features/Icone';
import { plurale } from '../shared/formato';

/** Pagina di un Tour (più date dello stesso spettacolo): copertina 3:2,
 *  nome, descrizione e sotto le date come card in formato lista. Ogni
 *  data porta DIRETTAMENTE alla sua pagina evento normale — nessun
 *  flusso di prenotazione qui dentro, è solo un indice. */
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
    description: tour ? (tour.descrizione?.trim() || `${plurale(tour.eventi.length, 'data disponibile', 'date disponibili')} per ${tour.nome}.`) : 'Più date, un solo spettacolo.',
    image: tour?.copertinaUrl ?? undefined,
    url: window.location.href,
  });

  return (
    <Layout>
      <main className="container-narrow tour-pagina">
        {stato === 'caricamento' && <p className="testo-intro">Carico il tour…</p>}
        {stato === 'non-trovato' && (
          <div className="stato-vuoto">
            <h3>Questo tour non è più disponibile</h3>
            <p>Le date potrebbero essere passate o non essere più in vendita.</p>
            <Link className="btn btn-secondary" to="/#eventi">Vedi tutti gli eventi</Link>
          </div>
        )}

        {stato === 'pronto' && tour && (
          <>
            <div className="tour-copertina">
              {tour.copertinaUrl ? (
                <img src={tour.copertinaUrl} alt={tour.nome} width={1200} height={800} loading="eager" {...{ fetchpriority: 'high' }} />
              ) : (
                <div className="card-segnaposto" aria-hidden="true">{inizialiDi(tour.nome)}</div>
              )}
            </div>
            <p className="eyebrow">Tour · {plurale(tour.eventi.length, 'data', 'date')}</p>
            <h1>{tour.nome}</h1>
            {tour.descrizione && <p className="tour-descrizione">{tour.descrizione}</p>}

            <section className="tour-date" aria-labelledby="tour-date-titolo">
              <h2 className="section-title" id="tour-date-titolo">Tutte le date</h2>
              {tour.eventi.length === 0 && <p className="testo-intro">Nessuna data disponibile al momento.</p>}
              {tour.eventi.map((d) => (
                <CardBase
                  key={d.id}
                  formato="lista"
                  href={`/eventi/${d.slug}`}
                  immagine={d.immagineUrl}
                  alt={`${d.artista} — ${d.luogo}, ${d.citta}`}
                  iniziali={inizialiDi(d.citta)}
                  kicker={formattaDataCard(d.data)}
                  titolo={d.citta}
                  righe={(
                    <span className="card-riga">
                      <Icona nome="pin" dimensione={16} />
                      <span>{d.luogo}</span>
                    </span>
                  )}
                  prezzo={d.vendibile && d.prezzoMinimo !== null ? { min: d.prezzoMinimo, max: d.prezzoMinimo } : null}
                  nota={d.vendibile ? null : 'Non disponibile'}
                  cta={d.vendibile ? 'Prenota' : 'Dettagli'}
                />
              ))}
            </section>
          </>
        )}
      </main>
    </Layout>
  );
}
