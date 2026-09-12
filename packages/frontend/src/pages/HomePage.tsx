import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { bundleApi, type BundlePubblico } from '../api/bundle';
import { BundleCard } from '../features/bundle/BundleCard';
import { eventiApi } from '../api/eventi';
import { categorieEventoApi, type CategoriaEvento } from '../api/categorieEvento';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { CardScheletro, EventoCard } from '../features/eventi/EventoCard';
import { CheckoutModal } from '../features/checkout/CheckoutModal';
import { Icona } from '../features/Icone';
import { pagineApi } from '../api/pagine';
import { useSeoTags } from '../features/useSeoTags';
import { plurale } from '../shared/formato';
import { comportamentoScorrimento } from '../shared/movimento';

// Le chiavi dei filtri che vivono nell'URL: "Mostra tutti" le toglie
// tutte insieme, in un solo aggiornamento. `evento` (checkout aperto da
// link) non è un filtro e resta. Niente filtri per città, date, prezzo o
// ordinamento: il cliente cerca l'evento per nome dalla casella
// dell'header (?q=…), decisione del proprietario.
const CHIAVI_FILTRI = ['categoria', 'genere', 'q'];

/** true da 901px in su: la vetrina dell'hero si monta solo lì, così
 *  sui telefoni le sue due immagini "eager" non si scaricano per niente. */
function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const aggiorna = () => setDesktop(mq.matches);
    mq.addEventListener('change', aggiorna);
    return () => mq.removeEventListener('change', aggiorna);
  }, []);
  return desktop;
}

function vaiAgliEventi() {
  document.getElementById('eventi')?.scrollIntoView({ behavior: comportamentoScorrimento() });
}

export function HomePage() {
  useSeoTags({
    title: 'OnWay — Bus per concerti ed eventi in tutta Italia',
    description: 'Prenota il tuo posto sul bus per concerti, festival ed eventi in tutta Italia: andata e ritorno dalla tua città, tour leader a bordo, prezzi chiari e conferma via email.',
    url: `${window.location.origin}/`,
  });
  const desktop = useDesktop();

  const caroselloRef = useRef<HTMLDivElement>(null);
  function scorriCarosello(direzione: 1 | -1) {
    caroselloRef.current?.scrollBy({ left: direzione * 600, behavior: comportamentoScorrimento() });
  }

  const [bundleEvidenza, setBundleEvidenza] = useState<BundlePubblico[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  // Testi della sezione hero — modificabili dal gestionale (Contenuti
  // sito → Testi Hero homepage). Questi qui sono i default: se non
  // sono mai stati personalizzati, si vede semplicemente questo testo.
  const [testiHero, setTestiHero] = useState<Record<string, string>>({});
  useEffect(() => {
    pagineApi.listContenuti().then((lista) => {
      const mappa: Record<string, string> = {};
      for (const c of lista) mappa[c.chiave] = c.valore;
      setTestiHero(mappa);
    }).catch(() => {});
  }, []);
  const t = (chiave: string, valoreDefault: string) => testiHero[chiave] || valoreDefault;

  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  // "Riprova" dopo un errore: incrementa e l'effetto ricarica.
  const [tentativo, setTentativo] = useState(0);
  const [eventoInCheckout, setEventoInCheckout] = useState<Evento | null>(null);

  useEffect(() => {
    bundleApi.listaPubblica().then((l) => setBundleEvidenza(l.filter((b) => b.inEvidenzaHome))).catch(() => {});
  }, []);
  useEffect(() => {
    let annullato = false;
    setCaricamento(true);
    setErrore(null);
    eventiApi.list({ soloFuturi: true, soloVisibili: true, escludiEventiInTour: true })
      .then((lista) => {
        if (annullato) return;
        setEventi(lista);
        // Se arrivo da un link con ?evento=ID (es. condiviso da un promoter
        // o dall'area cliente), apro subito il checkout di quell'evento.
        const idDaAprire = new URLSearchParams(window.location.search).get('evento');
        if (idDaAprire) {
          const trovato = lista.find((e) => e.id === idDaAprire);
          if (trovato) setEventoInCheckout(trovato);
        }
      })
      .catch((e) => { if (!annullato) setErrore(e instanceof ErroreApi ? e.message : 'Impossibile contattare il server'); })
      .finally(() => { if (!annullato) setCaricamento(false); });
    return () => { annullato = true; };
  }, [tentativo]);

  const consigliati = useMemo(() => eventi.filter((e) => e.inEvidenza), [eventi]);
  // Vetrina dell'hero: le prime due in evidenza; se nessuno è in
  // evidenza, i primi due eventi in programma, per non lasciare il
  // vuoto accanto al titolo.
  const vetrina = useMemo(() => (consigliati.length ? consigliati : eventi).slice(0, 2), [consigliati, eventi]);

  const [searchParams, setSearchParams] = useSearchParams();
  const ricercaTesto = searchParams.get('q') ?? '';
  const genereAttivo = searchParams.get('genere') ?? 'Tutti';
  function setGenereAttivo(g: string) {
    const nuovi = new URLSearchParams(searchParams);
    if (g === 'Tutti') nuovi.delete('genere'); else nuovi.set('genere', g);
    setSearchParams(nuovi, { replace: true });
  }
  // Categoria (primo livello della cascata) e genere (secondo) sono
  // parametri separati apposta, così i due filtri non si accavallano.
  const categoriaAttiva = searchParams.get('categoria');
  const filtriAttivi = Boolean(categoriaAttiva || genereAttivo !== 'Tutti' || ricercaTesto);
  function azzeraFiltri() {
    const nuovi = new URLSearchParams(searchParams);
    CHIAVI_FILTRI.forEach((k) => nuovi.delete(k));
    setSearchParams(nuovi, { replace: true });
  }

  // Le categorie: primo livello della cascata Tutti → Categorie → Generi.
  const [categorie, setCategorie] = useState<CategoriaEvento[]>([]);
  useEffect(() => { categorieEventoApi.list().then(setCategorie).catch(() => {}); }, []);
  function impostaCategoria(nome: string) {
    const nuovi = new URLSearchParams(searchParams);
    if (nome === 'Tutti') { nuovi.delete('categoria'); nuovi.delete('genere'); } else { nuovi.set('categoria', nome); nuovi.delete('genere'); }
    setSearchParams(nuovi, { replace: true });
  }
  // I generi mostrati sono SOLO quelli davvero presenti tra gli eventi
  // della categoria selezionata.
  const eventiDellaCategoria = useMemo(
    () => categoriaAttiva ? eventi.filter((e) => e.categoria === categoriaAttiva) : eventi,
    [eventi, categoriaAttiva]
  );
  const generi = useMemo(() => ['Tutti', ...new Set(eventiDellaCategoria.map((e) => e.genere))], [eventiDellaCategoria]);

  // Città di partenza e conteggio partenze: solo tragitti e fermate
  // attivi, gli stessi che le card mostrano in "Parte da…".
  const tragittiAttivi = (e: Evento) => [...e.tragitti, ...e.servizi.flatMap((v) => v.tragitti)].filter((tr) => tr.attivo);
  const numeroPartenze = useMemo(() => eventi.reduce((s, e) => s + tragittiAttivi(e).length, 0), [eventi]);
  const cittaPartenza = useMemo(() => {
    const insieme = new Set<string>();
    eventi.forEach((e) => tragittiAttivi(e).forEach((tr) => tr.fermate.forEach((f) => { if (f.attivo) insieme.add(f.citta); })));
    return Array.from(insieme).sort((a, b) => a.localeCompare(b, 'it'));
  }, [eventi]);

  const eventiFiltrati = useMemo(() => {
    let lista = genereAttivo === 'Tutti' ? eventi : eventi.filter((e) => e.genere === genereAttivo);
    if (categoriaAttiva) lista = lista.filter((e) => e.categoria === categoriaAttiva);
    // Normalizza per il confronto: minuscolo + senza accenti (così
    // "citta" trova anche "città") — sul testo cercato e sui campi.
    const normalizza = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const parole = normalizza(ricercaTesto.trim()).split(/\s+/).filter(Boolean);
    if (parole.length) {
      lista = lista.filter((e) => {
        // Ogni parola cercata deve trovarsi DA QUALCHE PARTE nel testo
        // dell'evento, non necessariamente tutte nello stesso campo.
        const testo = normalizza([
          e.artista, e.citta, e.luogo,
          ...[...e.tragitti, ...e.servizi.flatMap((v) => v.tragitti)].flatMap((l) => l.fermate.map((f) => f.citta)),
        ].join(' '));
        return parole.every((p) => testo.includes(p));
      });
    }
    // Ordine cronologico sempre garantito, esplicitamente. Mai alfabetico.
    return [...lista].sort((a, b) => a.data.localeCompare(b.data));
  }, [eventi, genereAttivo, categoriaAttiva, ricercaTesto]);

  // Al singolare solo se l'etichetta è quella predefinita — un testo
  // scritto a mano da Contenuti sito resta com'è.
  const etichettaPartenze = t('hero_statistica1_etichetta', 'Partenze attive');
  const etichettaPartenzeMostrata = numeroPartenze === 1 && etichettaPartenze === 'Partenze attive' ? 'Partenza attiva' : etichettaPartenze;

  return (
    <div className="container home">
      {/* ---------- HERO ---------- */}
      <section className="hero" aria-labelledby="hero-titolo">
        <div className="hero-grid">
          <div className="hero-testo">
            <p className="eyebrow">{t('hero_eyebrow', 'Bus per concerti in tutta Italia')}</p>
            <h1 className="hero-title" id="hero-titolo">
              <span>{t('hero_titolo_riga1', 'Sali sul bus.')}</span>
              <span className="line2">{t('hero_titolo_riga2', 'Vivi il concerto.')}</span>
            </h1>
            <p className="hero-sub">{t('hero_sottotitolo', 'Andata e ritorno in giornata, direttamente dalla tua città al palco del tuo artista preferito. Un solo biglietto, zero pensieri.')}</p>
            <div className="hero-azioni">
              <a className="btn btn-primary btn-lg" href="#eventi" onClick={(e) => { e.preventDefault(); vaiAgliEventi(); }}>Vedi gli eventi</a>
            </div>
            <div className="hero-stats">
              <div className="stat"><b>{caricamento ? '—' : numeroPartenze}</b><span>{etichettaPartenzeMostrata}</span></div>
              <div className="stat"><b>{caricamento ? '—' : cittaPartenza.length}</b><span>{t('hero_statistica2_etichetta', 'Città di partenza')}</span></div>
            </div>
          </div>

          {desktop && vetrina.length > 0 && (
            <div className="hero-vetrina">
              {/* Le card hanno titoli h3: senza questo h2 si salterebbe un livello dopo l'h1. */}
              <h2 className="sr-only">In primo piano</h2>
              {vetrina.map((ev) => <EventoCard key={ev.id} evento={ev} formato="griglia" priorita />)}
            </div>
          )}
        </div>
      </section>

      {/* ---------- IN EVIDENZA ---------- */}
      {consigliati.length > 0 && (
        <section className="home-sezione" id="consigliati" aria-labelledby="titolo-evidenza">
          <div className="section-head">
            <div>
              <h2 className="section-title" id="titolo-evidenza">In <em>evidenza</em></h2>
              <p className="section-sub">La nostra selezione dei viaggi più richiesti del momento.</p>
            </div>
            <div className="carosello-frecce">
              <button type="button" onClick={() => scorriCarosello(-1)} aria-label="Scorri a sinistra"><Icona nome="freccia" /></button>
              <button type="button" onClick={() => scorriCarosello(1)} aria-label="Scorri a destra"><Icona nome="freccia" /></button>
            </div>
          </div>
          <div className="carosello-wrap">
            <div className="carosello" ref={caroselloRef}>
              {consigliati.map((ev) => <EventoCard key={ev.id} evento={ev} formato="griglia" />)}
            </div>
          </div>
        </section>
      )}

      {/* ---------- TUTTI GLI EVENTI ---------- */}
      <section className="home-sezione" id="eventi" aria-labelledby="titolo-eventi">
        <div className="section-head">
          <div>
            <div className="section-titolo-riga">
              <h2 className="section-title" id="titolo-eventi">Tutti gli <em>eventi</em></h2>
              {!caricamento && !errore && (
                <span className="section-conteggio" aria-live="polite">{plurale(eventiFiltrati.length, 'evento', 'eventi')}</span>
              )}
            </div>
            <p className="section-sub">Scegli l'evento e la tua fermata: al resto pensiamo noi.</p>
          </div>
        </div>

        <div className="filter-bar" role="group" aria-label="Categorie e generi">
          {!categoriaAttiva ? (
            // Primo livello della cascata — nessuna categoria ancora
            // scelta: si vedono le categorie, non i generi.
            <>
              <button type="button" className="chip active" aria-pressed="true" disabled>Tutti</button>
              {categorie.map((c) => (
                <button key={c.id} type="button" className="chip" onClick={() => impostaCategoria(c.nome)}>{c.nome}</button>
              ))}
            </>
          ) : (
            // Secondo livello — una categoria è scelta: i generi presenti
            // SOLO in quella categoria. Il primo chip (col nome della
            // categoria) azzera il genere; "Tutte le categorie" esce del tutto.
            <>
              <button type="button" className="chip" onClick={() => impostaCategoria('Tutti')}>Tutte le categorie</button>
              {generi.map((g) => (
                <button key={g} type="button" className={`chip${g === genereAttivo ? ' active' : ''}`} aria-pressed={g === genereAttivo} onClick={() => setGenereAttivo(g)}>
                  {g === 'Tutti' ? categoriaAttiva : g}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Senza risultati lo stato vuoto qui sotto ha già "Mostra tutti gli eventi" */}
        {ricercaTesto && !caricamento && !errore && eventiFiltrati.length > 0 && (
          <div className="ricerca-attiva">
            <p>Risultati per <strong>«{ricercaTesto}»</strong></p>
            <button type="button" className="btn btn-tertiary btn-sm" onClick={azzeraFiltri}>Mostra tutti</button>
          </div>
        )}

        {caricamento && (
          <div className="elenco-eventi" aria-busy="true" aria-label="Carico gli eventi…">
            {Array.from({ length: 6 }, (_, i) => <CardScheletro key={i} />)}
          </div>
        )}
        {!caricamento && errore && (
          <div className="stato-vuoto" role="alert">
            <h3>Non riesco a caricare gli eventi</h3>
            <p>{errore}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setTentativo((n) => n + 1)}>Riprova</button>
          </div>
        )}
        {!caricamento && !errore && eventiFiltrati.length === 0 && (
          filtriAttivi ? (
            <div className="stato-vuoto">
              <h3>{ricercaTesto ? 'Nessun evento trovato' : 'Nessun evento in questa categoria'}</h3>
              <p>{ricercaTesto ? "Controlla come hai scritto il nome dell'artista o dell'evento, oppure guarda tutti gli eventi in programma." : 'Guarda tutti gli eventi in programma.'}</p>
              <button type="button" className="btn btn-secondary" onClick={azzeraFiltri}>Mostra tutti gli eventi</button>
            </div>
          ) : (
            <div className="stato-vuoto">
              <h3>Nessun evento in programma</h3>
              <p>Stiamo preparando le prossime partenze: torna a trovarci tra poco.</p>
            </div>
          )
        )}
        {!caricamento && !errore && eventiFiltrati.length > 0 && (
          <div className="elenco-eventi">
            {eventiFiltrati.map((ev) => <EventoCard key={ev.id} evento={ev} formato="adattiva" />)}
          </div>
        )}
      </section>

      {/* ---------- BUNDLE ---------- */}
      {bundleEvidenza.length > 0 && (
        <section className="home-sezione" id="bundle" aria-labelledby="titolo-bundle">
          <div className="section-head">
            <div>
              <h2 className="section-title" id="titolo-bundle">Bundle</h2>
              <p className="section-sub">Più eventi insieme, con uno sconto dedicato.</p>
            </div>
            <Link className="btn btn-secondary btn-sm" to="/bundle">Tutti i bundle</Link>
          </div>
          <div className="griglia-eventi">
            {bundleEvidenza.map((b) => <BundleCard key={b.id} bundle={b} />)}
          </div>
        </section>
      )}

      {/* ---------- COME FUNZIONA ---------- */}
      <section className="how" id="come-funziona" aria-labelledby="titolo-come-funziona">
        <div className="section-head">
          <div>
            <h2 className="section-title" id="titolo-come-funziona">Come <em>funziona</em></h2>
            <p className="section-sub">Tre passaggi, un solo biglietto.</p>
          </div>
        </div>
        <ol className="how-grid">
          <li className="how-step">
            <span className="how-num" aria-hidden="true">1</span>
            <h3>Scegli l'evento</h3>
            <p>Cerca l'artista o la città e guarda le partenze disponibili vicino a te.</p>
          </li>
          <li className="how-step">
            <span className="how-num" aria-hidden="true">2</span>
            <h3>Prenota la fermata</h3>
            <p>Scegli la fermata più comoda e il numero di posti. Ricevi subito la conferma via email.</p>
          </li>
          <li className="how-step">
            <span className="how-num" aria-hidden="true">3</span>
            <h3>Sali e parti</h3>
            <p>Ti aspettiamo al punto di ritrovo con il tour leader. Andata, evento e ritorno, tutto organizzato.</p>
          </li>
        </ol>
      </section>

      {/* ---------- PERCHÉ ONWAY ---------- */}
      <section className="perche" aria-labelledby="titolo-perche">
        <div className="section-head">
          <div>
            <h2 className="section-title" id="titolo-perche">Perché <em>OnWay</em></h2>
          </div>
        </div>
        <ul className="perche-grid">
          <li className="perche-voce">
            <span className="perche-icona"><Icona nome="andata-ritorno" /></span>
            <h3>Andata e ritorno</h3>
            <p>Parti dalla tua città e torni la stessa notte, tutto compreso.</p>
          </li>
          <li className="perche-voce">
            <span className="perche-icona"><Icona nome="utenti" /></span>
            <h3>Tour leader a bordo</h3>
            <p>Una persona dello staff viaggia con te e ti accompagna fino all'ingresso.</p>
          </li>
          <li className="perche-voce">
            <span className="perche-icona"><Icona nome="orologio" /></span>
            <h3>Prenoti in 2 minuti, anche senza account</h3>
            <p>Scegli fermata e posti, ricevi la conferma via email.</p>
          </li>
          <li className="perche-voce">
            <span className="perche-icona"><Icona nome="spunta" /></span>
            <h3>Lista d'attesa gratuita se è tutto pieno</h3>
            <p>Ti avvisiamo noi appena si libera un posto.</p>
          </li>
        </ul>
      </section>

      {eventoInCheckout && <CheckoutModal evento={eventoInCheckout} onClose={() => setEventoInCheckout(null)} />}
    </div>
  );
}
