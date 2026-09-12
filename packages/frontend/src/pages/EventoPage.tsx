import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { eventiApi } from '../api/eventi';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento } from '../api/prezzi';
import { useSeoTags } from '../features/useSeoTags';
import { EventoDettaglio, EventoScheletro } from '../features/evento/EventoDettaglio';
import { Layout } from '../Layout';
import { formattaEuro } from '../shared/formato';

type Stato = 'caricamento' | 'pronto' | 'non-trovato' | 'errore';

/** Pagina propria per ogni evento — indicizzabile da Google e
 *  condivisibile con un'anteprima specifica (titolo, immagine, prezzo).
 *  Il corpo è EventoDettaglio, condiviso con la pagina offerta. */
export function EventoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [evento, setEvento] = useState<Evento | null>(null);
  // "Riprova" dopo un errore: incrementa e l'effetto ricarica.
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    if (!slug) return;
    setStato('caricamento');
    eventiApi.getBySlug(slug)
      .then((e) => { setEvento(e); setStato('pronto'); })
      .catch((e) => setStato(e instanceof ErroreApi && e.status === 404 ? 'non-trovato' : 'errore'));
  }, [slug, tentativo]);

  const prezzoMinimo = evento ? prezzoMinimoEvento(evento) : null;
  const copertina = evento?.immagini[0]?.url;

  useSeoTags({
    title: evento ? `${evento.artista} — ${evento.luogo}, ${evento.citta} | OnWay` : 'Evento | OnWay',
    description: evento
      ? (evento.descrizioneSeo?.trim() || `Bus per ${evento.artista} il ${new Date(evento.data).toLocaleDateString('it-IT')} a ${evento.citta}${prezzoMinimo !== null ? ` — a partire da ${formattaEuro(prezzoMinimo)}` : ''}. Prenota il tuo posto con OnWay.`)
      : 'Prenota il tuo bus per l\'evento con OnWay.',
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
      <div className="container evento-pagina">
        {stato === 'caricamento' && <EventoScheletro />}

        {stato === 'non-trovato' && (
          <div className="stato-vuoto">
            <h3>Evento non trovato</h3>
            <p>Questo evento non è più disponibile, oppure il link non è corretto.</p>
            <Link className="btn btn-primary" to="/#eventi">Vedi tutti gli eventi</Link>
          </div>
        )}

        {stato === 'errore' && (
          <div className="stato-vuoto" role="alert">
            <h3>Non riesco a caricare l'evento</h3>
            <p>Potrebbe essere un problema temporaneo di connessione.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setTentativo((n) => n + 1)}>Riprova</button>
          </div>
        )}

        {stato === 'pronto' && evento && <EventoDettaglio evento={evento} />}
      </div>
    </Layout>
  );
}
