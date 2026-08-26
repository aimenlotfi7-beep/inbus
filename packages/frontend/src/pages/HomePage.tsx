import { useEffect, useMemo, useRef, useState } from 'react';
import { eventiApi } from '../api/eventi';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { EventoCard } from '../features/eventi/EventoCard';
import { CheckoutModal } from '../features/checkout/CheckoutModal';

export function HomePage() {
  const caroselloRef = useRef<HTMLDivElement>(null);
  function scorriCarosello(direzione: 1 | -1) {
    caroselloRef.current?.scrollBy({ left: direzione * 600, behavior: 'smooth' });
  }
  const caroselloHeroRef = useRef<HTMLDivElement>(null);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [eventoInCheckout, setEventoInCheckout] = useState<Evento | null>(null);
  const [genereAttivo, setGenereAttivo] = useState('Tutti');

  useEffect(() => {
    eventiApi.list({ soloFuturi: true, soloVisibili: true })
      .then((lista) => {
        setEventi(lista);
        // Se arrivo da un link con ?evento=ID (es. condiviso da un promoter
        // o dall'area cliente), apro subito il checkout di quell'evento.
        const idDaAprire = new URLSearchParams(window.location.search).get('evento');
        if (idDaAprire) {
          const trovato = lista.find((e) => e.id === idDaAprire);
          if (trovato) setEventoInCheckout(trovato);
        }
      })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile contattare il server'))
      .finally(() => setCaricamento(false));
  }, []);

  const consigliati = useMemo(() => eventi.filter((e) => e.inEvidenza), [eventi]);

  // Scorrimento automatico del carosello nell'hero — ogni 2 secondi
  // avanza di una card, e torna all'inizio una volta arrivato in fondo
  // (invece di restare bloccato contro il bordo destro).
  useEffect(() => {
    if (eventi.length < 2) return;
    const intervallo = setInterval(() => {
      const el = caroselloHeroRef.current;
      if (!el) return;
      const allaFine = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
      if (allaFine) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: 300, behavior: 'smooth' });
      }
    }, 2000);
    return () => clearInterval(intervallo);
  }, [eventi.length]);
  const generi = useMemo(() => ['Tutti', ...new Set(eventi.map((e) => e.genere))], [eventi]);
  const [ricercaTesto, setRicercaTesto] = useState('');
  const eventiFiltrati = useMemo(() => {
    let lista = genereAttivo === 'Tutti' ? eventi : eventi.filter((e) => e.genere === genereAttivo);
    const q = ricercaTesto.trim().toLowerCase();
    if (q) {
      lista = lista.filter((e) =>
        e.artista.toLowerCase().includes(q) ||
        e.citta.toLowerCase().includes(q) ||
        e.luogo.toLowerCase().includes(q) ||
        [...e.tragitti, ...e.servizi.flatMap((v) => v.tragitti)].some((l) => l.fermate.some((f) => f.citta.toLowerCase().includes(q)))
      );
    }
    return lista;
  }, [eventi, genereAttivo, ricercaTesto]);

  // Numeri veri, calcolati dai dati reali — non inventati: quante
  // tratte attive, quante città di partenza distinte tra tutte.
  const numeroPartenze = useMemo(() => eventi.reduce((s, e) => s + e.tragitti.length + e.servizi.reduce((s2, v) => s2 + v.tragitti.length, 0), 0), [eventi]);
  const cittaPartenza = useMemo(() => {
    const insieme = new Set<string>();
    eventi.forEach((e) => [...e.tragitti, ...e.servizi.flatMap((v) => v.tragitti)].forEach((l) => l.fermate.forEach((f) => insieme.add(f.citta))));
    return Array.from(insieme).sort();
  }, [eventi]);

  return (
    <>
      {/* Ricerca fissa in alto, trasparente — fuori da .hero apposta
          (che ha overflow:hidden per i gradienti decorativi, e
          romperebbe lo "sticky" se fosse dentro): così resta visibile
          scorrendo tutta la pagina, non solo dentro l'hero. */}
      <div className="hero-ricerca-top">
        <div className="hero-ricerca-riga">
          <div className="hero-ricerca-campo">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            <input
              type="text"
              placeholder="Cerca artista, evento o città..."
              list="artistiList"
              value={ricercaTesto}
              onChange={(e) => setRicercaTesto(e.target.value)}
            />
            <datalist id="artistiList">{eventi.map((e) => <option key={e.id} value={e.artista} />)}</datalist>
          </div>
          <button className="search-cta" onClick={() => document.getElementById('eventi')?.scrollIntoView({ behavior: 'smooth' })}>
            Cerca il bus
            </button>
          </div>
          <div className="hero-ricerca-categorie">
            {['Tutti', 'Concerti', 'Festival', 'Sport'].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`categoria-chip${genereAttivo === cat ? ' active' : ''}`}
                onClick={() => setGenereAttivo(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">Bus per concerti in tutta Italia</div>
            <h1 className="hero-title"><span>Sali sul bus.</span><span className="line2">Vivi il concerto.</span></h1>
            <p className="hero-sub">Andata e ritorno in giornata, direttamente dalla tua città al palco del tuo artista preferito. Un solo biglietto, zero pensieri.</p>
            <div className="hero-stats">
              <div className="stat"><b>{numeroPartenze}</b><span>Partenze attive</span></div>
              <div className="stat"><b>{cittaPartenza.length}</b><span>Città di partenza</span></div>
            </div>
          </div>

          {/* Tutti gli eventi, che scorrono da soli ogni 2 secondi —
              al posto del vecchio modulo di ricerca, ora spostato sopra. */}
          <div className="hero-carosello-wrap">
            <div className="hero-carosello" ref={caroselloHeroRef}>
              {eventi.map((ev) => <EventoCard key={ev.id} evento={ev} />)}
            </div>
          </div>
        </div>
      </section>

      {!!cittaPartenza.length && (
        <section className="events-section parti-da-sezione">
          <div className="section-head">
            <div>
              <h2 className="section-title">Parti <em>da</em></h2>
              <p className="section-sub">Scegli la tua città — filtriamo subito i viaggi con una fermata lì.</p>
            </div>
          </div>
          <div className="parti-da-chips">
            {cittaPartenza.map((citta) => (
              <button
                key={citta}
                type="button"
                className={`parti-da-chip${ricercaTesto === citta ? ' active' : ''}`}
                onClick={() => {
                  setRicercaTesto(ricercaTesto === citta ? '' : citta);
                  document.getElementById('eventi')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {citta}
              </button>
            ))}
          </div>
        </section>
      )}

      {!!consigliati.length && (
        <section className="events-section" id="consigliati">
          <div className="section-head">
            <div>
              <h2 className="section-title">Eventi <em>consigliati</em></h2>
              <p className="section-sub">La nostra selezione dei viaggi più caldi del momento.</p>
            </div>
            <div className="carosello-frecce">
              <button type="button" onClick={() => scorriCarosello(-1)} aria-label="Scorri a sinistra">‹</button>
              <button type="button" onClick={() => scorriCarosello(1)} aria-label="Scorri a destra">›</button>
            </div>
          </div>
          <div className="carosello-wrap">
            <div className="carosello" ref={caroselloRef}>
              {consigliati.map((ev) => <EventoCard key={ev.id} evento={ev} />)}
            </div>
          </div>
        </section>
      )}

      <section className="events-section" id="eventi">
        <div className="section-head">
          <div>
            <h2 className="section-title">Tutti gli <em>eventi</em></h2>
            <p className="section-sub">Scegli il concerto, scegli la tua fermata, il resto lo pensiamo noi.</p>
          </div>
        </div>
        <div className="filter-bar">
          {generi.map((g) => (
            <button key={g} className={`chip${g === genereAttivo ? ' active' : ''}`} onClick={() => setGenereAttivo(g)}>{g}</button>
          ))}
        </div>

        {caricamento && <p style={{ color: 'var(--mist)', padding: 40, textAlign: 'center' }}>Carico gli eventi...</p>}
        {errore && <p className="errore" style={{ padding: 40, textAlign: 'center' }}>{errore}</p>}
        {!caricamento && !errore && !eventiFiltrati.length && (
          <p style={{ color: 'var(--mist)', padding: 40, textAlign: 'center' }}>Nessun evento per questo filtro.</p>
        )}
        <div className="grid">
          {eventiFiltrati.map((ev) => <EventoCard key={ev.id} evento={ev} />)}
        </div>
      </section>

      <section className="how" id="come-funziona">
        <div className="section-head">
          <div>
            <h2 className="section-title">Come <em>funziona</em></h2>
            <p className="section-sub">Tre passaggi, un solo biglietto.</p>
          </div>
        </div>
        <div className="how-grid">
          <div className="how-step"><span className="how-num">01</span><h4>Scegli il concerto</h4><p>Cerca il tuo artista o la data dell'evento e trova tutte le partenze disponibili dalla tua zona.</p></div>
          <div className="how-step"><span className="how-num">02</span><h4>Prenota la fermata</h4><p>Seleziona la fermata più comoda per te e blocca il posto: paghi online, ricevi il biglietto via email.</p></div>
          <div className="how-step"><span className="how-num">03</span><h4>Sali e parti</h4><p>Ti aspettiamo al punto di ritrovo. Andata, concerto, ritorno: tutto già organizzato.</p></div>
        </div>
      </section>

      <div className="strip">
        <div className="strip-item"><b>15 anni</b><span>Di esperienza</span></div>
        <div className="strip-item"><b>100%</b><span>Assicurati</span></div>
        <div className="strip-item"><b>0€</b><span>Costi di parcheggio</span></div>
        <div className="strip-item"><b>24/7</b><span>Assistenza WhatsApp</span></div>
      </div>

      {eventoInCheckout && <CheckoutModal evento={eventoInCheckout} onClose={() => setEventoInCheckout(null)} />}
    </>
  );
}
