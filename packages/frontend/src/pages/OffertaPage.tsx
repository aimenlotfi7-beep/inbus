import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { offerteApi } from '../api/offerte';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento, applicaScontoOfferta } from '../api/prezzi';
import type { OffertaCheckout } from '../features/checkout/CheckoutForm';
import { EventoDettaglio, EventoScheletro } from '../features/evento/EventoDettaglio';
import { useSeoTags } from '../features/useSeoTags';
import { Layout } from '../Layout';

type Stato = 'caricamento' | 'pronto' | 'non-trovata' | 'errore';

/** /offerta/:slug — la stessa pagina dell'evento (EventoDettaglio) con
 *  il banner dell'offerta e i prezzi scontati; barra e foglio mobile
 *  compresi. */
export function OffertaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [evento, setEvento] = useState<Evento | null>(null);
  const [offerta, setOfferta] = useState<OffertaCheckout | null>(null);
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    if (!slug) return;
    setStato('caricamento');
    offerteApi.getBySlug(slug)
      .then((r) => {
        setEvento(r.evento);
        setOfferta({ id: r.offerta.id, nome: r.offerta.nome, scontoPercentuale: Number(r.offerta.scontoPercentuale) });
        setStato('pronto');
      })
      .catch((e) => setStato(e instanceof ErroreApi && e.status !== 0 && e.status < 500 ? 'non-trovata' : 'errore'));
  }, [slug, tentativo]);

  const prezzoMinimo = evento ? prezzoMinimoEvento(evento) : null;
  const copertina = evento?.immagini[0]?.url;

  useSeoTags({
    title: evento && offerta ? `${evento.artista} — ${offerta.nome} | OnWay` : 'Offerta | OnWay',
    description: evento && offerta
      ? `Offerta "${offerta.nome}": −${offerta.scontoPercentuale.toFixed(0)}% sul bus per ${evento.artista} a ${evento.citta}. Prenota il tuo posto con OnWay.`
      : 'Offerta speciale OnWay.',
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
        offers: { '@type': 'Offer', price: applicaScontoOfferta(prezzoMinimo, offerta.scontoPercentuale).toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: window.location.href },
      }),
    } : undefined,
  });

  return (
    <Layout>
      <div className="container evento-pagina">
        {stato === 'caricamento' && <EventoScheletro />}

        {stato === 'non-trovata' && (
          <div className="stato-vuoto">
            <h3>Offerta non disponibile</h3>
            <p>Questo link non è più valido: l'offerta è scaduta o è stata ritirata. Gli eventi restano prenotabili al prezzo normale.</p>
            <Link className="btn btn-primary" to="/#eventi">Vedi tutti gli eventi</Link>
          </div>
        )}

        {stato === 'errore' && (
          <div className="stato-vuoto" role="alert">
            <h3>Non riesco a caricare l'offerta</h3>
            <p>Potrebbe essere un problema temporaneo di connessione.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setTentativo((n) => n + 1)}>Riprova</button>
          </div>
        )}

        {stato === 'pronto' && evento && offerta && <EventoDettaglio evento={evento} offerta={offerta} />}
      </div>
    </Layout>
  );
}
