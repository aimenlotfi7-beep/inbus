import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento } from '../api/prezzi';
import { useSeoTags } from '../features/useSeoTags';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { PercorsoBus } from '../features/PercorsoBus';
import { Layout } from '../Layout';

const ETICHETTA_STATO: Record<NonNullable<Evento['statoDisponibilita']>, string> = {
  POCHI_POSTI: 'Pochi posti disponibili',
  NUOVI_POSTI: 'Nuovi posti disponibili',
  ESAURITO: 'Posti terminati',
};

type Stato = 'caricamento' | 'pronto' | 'non-trovato';

/** Pagina propria per ogni evento — indicizzabile da Google e
 *  condivisibile con un'anteprima specifica (titolo, immagine, prezzo).
 *  A sinistra: foto piccola + sezione informazioni (scritta dal
 *  gestionale). A destra: prenotazione a step, sempre visibile, niente
 *  popup da aprire. */
export function EventoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [evento, setEvento] = useState<Evento | null>(null);
  // Solo su cellulare: il modulo prenotazione parte "chiuso" (si vede
  // solo prezzo + pulsante), si apre quando lo tocchi — su desktop
  // questo stato non ha effetto (è sempre visibile, c'è spazio). Pattern
  // standard per il checkout mobile: CTA sempre raggiungibile invece di
  // un modulo lungo subito in mezzo alla pagina.
  const [prenotazioneAperta, setPrenotazioneAperta] = useState(false);
  const checkoutRef = useRef<HTMLDivElement>(null);

  function apriPrenotazione() {
    setPrenotazioneAperta(true);
    // Piccolo ritardo: aspetta che il modulo diventi visibile (cambio di
    // display) prima di scorrere, altrimenti scrollIntoView calcola la
    // posizione sul contenuto ancora nascosto/compatto.
    setTimeout(() => checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  /** Scorrimento controllato via codice (non un semplice link #ancora):
   *  calcolo io la posizione esatta e tolgo un margine per l'intestazione
   *  fissa in cima allo schermo, altrimenti coprirebbe l'inizio della
   *  sezione — più affidabile del comportamento nativo del browser, che
   *  varia tra dispositivi diversi. */
  function scorriA(id: string) {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    const y = elemento.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

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
      ? (evento.descrizioneSeo?.trim() || `Bus per ${evento.artista} il ${new Date(evento.data).toLocaleDateString('it-IT')} a ${evento.citta}${prezzoMinimo !== null ? ` — a partire da €${prezzoMinimo.toFixed(2)}` : ''}. Prenota il tuo posto con INBUS.`)
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
      <div style={{ maxWidth: 1100, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">
            Questo evento non è (più) disponibile. Puoi vedere tutti gli eventi in <a href="/">home page</a>.
          </div>
        )}

        {stato === 'pronto' && evento && (
          <div className="evento-pagina-corpo">
            <div className="evento-pagina-info">
              <div className={`evento-pagina-hero${copertina ? '' : ' senza-foto'}`} style={copertina ? { backgroundImage: `url(${copertina})` } : undefined}>
                <span className="tag">{evento.genere}</span>
              </div>

              <h1>{evento.artista}</h1>
              <p className="meta-riga">📍 {evento.luogo}, {evento.citta}</p>
              <p className="meta-riga">📅 {new Date(evento.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

              {evento.statoDisponibilita && (
                <p style={{ background: 'rgba(255,180,80,.15)', border: '1px solid rgba(255,180,80,.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, display: 'inline-block', marginTop: 10 }}>
                  {ETICHETTA_STATO[evento.statoDisponibilita]}
                </p>
              )}

              {prezzoMinimo !== null && (
                <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, marginTop: 14 }}>da €{prezzoMinimo.toFixed(2)} <span style={{ fontSize: 13, opacity: .7 }}>/persona</span></p>
              )}

              <PercorsoBus evento={evento} />

              {/* Solo su cellulare: scorciatoie per saltare subito alle due
                  sezioni qui sotto, dato che ora la prenotazione viene
                  prima di loro nell'ordine visivo. */}
              {(evento.descrizioneSeo || evento.descrizione) && (
                <div className="salti-rapidi-mobile">
                  {evento.descrizioneSeo && (
                    <button type="button" className="btn btn-ghost" onClick={() => scorriA('descrizione-evento')}>Descrizione evento</button>
                  )}
                  {evento.descrizione && (
                    <button type="button" className="btn btn-ghost" onClick={() => scorriA('informazioni')}>Informazioni</button>
                  )}
                </div>
              )}

              {evento.descrizioneSeo && (
                <div className="sezione-info" id="descrizione-evento">
                  <h4>Descrizione evento</h4>
                  {evento.descrizioneSeo}
                </div>
              )}

              {evento.descrizione && (
                <div className="sezione-info" id="informazioni">
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

            <div ref={checkoutRef} className={`evento-pagina-checkout${prenotazioneAperta ? ' aperta-mobile' : ''}`}>
              {/* Su desktop questo bottone non si vede mai (è il CSS
                  a nasconderlo sopra i 900px) — il modulo lì è sempre
                  visibile per intero, come prima. */}
              <button
                type="button"
                className="checkout-riepilogo-chiuso"
                onClick={apriPrenotazione}
              >
                <span>
                  {prezzoMinimo !== null ? <>da <b>€{prezzoMinimo.toFixed(2)}</b> /persona</> : 'Vedi disponibilità'}
                </span>
                <span className="checkout-riepilogo-cta">Prenota</span>
              </button>
              <div className="checkout-form-wrap">
                <CheckoutForm evento={evento} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra fissa in fondo allo schermo, solo su cellulare e solo
          quando il modulo è ancora chiuso — resta sempre raggiungibile
          col pollice mentre si scorre la pagina, senza dover risalire
          fino al modulo. */}
      {evento && !prenotazioneAperta && (
        <div className="barra-prenota-fissa-mobile">
          <span>{prezzoMinimo !== null ? <>da <b>€{prezzoMinimo.toFixed(2)}</b> /persona</> : ''}</span>
          <button type="button" onClick={apriPrenotazione}>Prenota</button>
        </div>
      )}
    </Layout>
  );
}
