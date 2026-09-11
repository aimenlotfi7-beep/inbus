import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { eventiApi } from '../api/eventi';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { prezzoMinimoEvento } from '../api/prezzi';
import { useSeoTags } from '../features/useSeoTags';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { SezioniAccordion } from '../features/SezioniAccordion';
import { PulsanteCondividi } from '../features/PulsanteCondividi';
import { EventiCorrelati } from '../features/EventiCorrelati';
import { Layout } from '../Layout';
import { formattaEuro } from '../shared/formato';

const ETICHETTA_STATO: Record<NonNullable<Evento['statoDisponibilita']>, string> = {
  POCHI_POSTI: 'Pochi posti disponibili',
  NUOVI_POSTI: 'Nuovi posti disponibili',
  ESAURITO: 'Posti terminati',
};

type Stato = 'caricamento' | 'pronto' | 'non-trovato' | 'errore';

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

  useEffect(() => {
    if (!slug) return;
    setStato('caricamento');
    eventiApi.getBySlug(slug)
      .then((e) => { setEvento(e); setStato('pronto'); })
      .catch((e) => setStato(e instanceof ErroreApi && e.status === 404 ? 'non-trovato' : 'errore'));
  }, [slug]);

  // Prova sociale — quante persone hanno già confermato. Caricata a
  // parte (non blocca la pagina vera), e mostrata solo sopra una
  // soglia: "2 persone hanno prenotato" sembra scarso invece che
  // rassicurante, meglio non dire nulla in quel caso.
  const [prenotazioniConfermate, setPrenotazioniConfermate] = useState<number | null>(null);
  useEffect(() => {
    if (!evento) return;
    eventiApi.conteggioPrenotazioni(evento.id).then((r) => setPrenotazioniConfermate(r.conteggio)).catch(() => {});
  }, [evento?.id]);

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
      <div style={{ maxWidth: 1100, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">
            Questo evento non è (più) disponibile. Puoi vedere tutti gli eventi in <a href="/">home page</a>.
          </div>
        )}

        {stato === 'errore' && (
          <div className="checkout-summary">
            Non riusciamo a caricare questo evento in questo momento — potrebbe essere un problema temporaneo di connessione. <a href="" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>Riprova</a>.
          </div>
        )}

        {stato === 'pronto' && evento && (
          <div className="evento-pagina-corpo">
            <div className="evento-pagina-info">
              <div className={`evento-pagina-hero${copertina ? '' : ' senza-foto'}`} style={copertina ? { backgroundImage: `url(${copertina})` } : undefined}>
                <span className="tag">{evento.genere}</span>
                <div style={{ position: 'absolute', top: 14, right: 14 }}>
                  <PulsanteCondividi soloIcona titolo={`${evento.artista} — OnWay`} testo={`Vieni con noi in bus a vedere ${evento.artista}, ${evento.luogo} (${evento.citta})`} />
                </div>
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
                <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, marginTop: 14 }}>da {formattaEuro(prezzoMinimo)} <span style={{ fontSize: 13, opacity: .7 }}>/persona</span></p>
              )}
              {prenotazioniConfermate !== null && prenotazioniConfermate >= 10 && (
                <p style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>{prenotazioniConfermate} persone hanno già prenotato per questo evento</p>
              )}

              {/* "Informazioni pratiche" — SEMPRE visibile, non dentro un
                  accordion da aprire: la ricerca UX di settore (Baymard,
                  tour ed esperienze) trova che punto di arrivo, cosa è
                  incluso e requisiti sono tra le informazioni che, se
                  difficili da trovare, fanno abbandonare la prenotazione
                  — non vanno nascoste dietro un click. Il punto di arrivo
                  vive sul tragitto (può cambiare da fermata a fermata),
                  si prende dal primo tragitto attivo che lo ha compilato:
                  un'approssimazione onesta finché resta un solo punto di
                  arrivo per evento nella pratica comune. */}
              {(() => {
                const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((v) => v.tragitti)];
                const arrivo = tuttiITragitti.find((t) => t.attivo && t.arrivoIndirizzo);
                if (!arrivo && !evento.cosaIncluso && !evento.requisitiNote) return null;
                return (
                  <div className="panel-box" style={{ marginTop: 18 }}>
                    <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 16, margin: '0 0 10px' }}>Informazioni pratiche</h2>
                    {arrivo && (
                      <p style={{ fontSize: 13.5, marginBottom: 8 }}>
                        📍 <b>Punto di arrivo:</b> {arrivo.arrivoIndirizzo}{arrivo.arrivoOrario ? ` — ore ${arrivo.arrivoOrario}` : ''}
                      </p>
                    )}
                    {evento.cosaIncluso && (
                      <p style={{ fontSize: 13.5, marginBottom: 8, whiteSpace: 'pre-line' }}>✓ <b>Cosa include:</b> {evento.cosaIncluso}</p>
                    )}
                    {evento.requisitiNote && (
                      <p style={{ fontSize: 13.5, marginBottom: 8, whiteSpace: 'pre-line' }}>⚠️ {evento.requisitiNote}</p>
                    )}
                    <p style={{ fontSize: 12, opacity: .7, marginTop: 10, marginBottom: 0 }}>
                      <Link to="/pagina/termini">Politica di cancellazione e termini</Link>
                    </p>
                  </div>
                );
              })()}

              <SezioniAccordion evento={evento} />

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
                  {prezzoMinimo !== null ? <>da <b>{formattaEuro(prezzoMinimo)}</b> /persona</> : 'Vedi disponibilità'}
                </span>
                <span className="checkout-riepilogo-cta">Acquista ora</span>
              </button>
              <div className="checkout-form-wrap">
                <CheckoutForm evento={evento} />
              </div>
            </div>
          </div>
        )}
      </div>

      {stato === 'pronto' && evento && <EventiCorrelati evento={evento} />}

      {/* Barra fissa in fondo allo schermo, solo su cellulare e solo
          quando il modulo è ancora chiuso — resta sempre raggiungibile
          col pollice mentre si scorre la pagina, senza dover risalire
          fino al modulo. */}
      {evento && !prenotazioneAperta && (
        <div className="barra-prenota-fissa-mobile">
          <span>{prezzoMinimo !== null ? <>da <b>{formattaEuro(prezzoMinimo)}</b> /persona</> : ''}</span>
          <button type="button" onClick={apriPrenotazione}>Acquista ora</button>
        </div>
      )}
    </Layout>
  );
}
