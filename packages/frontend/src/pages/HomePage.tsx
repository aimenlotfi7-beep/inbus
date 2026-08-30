import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { eventiApi } from '../api/eventi';
import { categorieEventoApi, type CategoriaEvento } from '../api/categorieEvento';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { EventoCard } from '../features/eventi/EventoCard';
import { CheckoutModal } from '../features/checkout/CheckoutModal';
import { pagineApi } from '../api/pagine';

// Quante card clonare a inizio/fine del carosello hero, per l'effetto
// circolare — abbastanza da coprire anche uno schermo largo (mai più
// di quante card ci sono davvero, per eventi con pochi risultati).
const NUM_CLONI_CAROSELLO = 5;
// Con troppi pochi eventi, il "giro infinito" (cloni all'inizio e alla
// fine, per l'illusione di uno scorrimento senza fine) non ha senso —
// anzi confonde: con un solo evento, l'utente vedrebbe la STESSA card
// ripetuta 3 volte (un clone, la vera, un altro clone), sembrando un
// errore di duplicazione invece che l'effetto voluto. Sotto questa
// soglia, niente cloni: si vedono solo le card vere, ferme.
const SOGLIA_MINIMA_GIRO_INFINITO = 3;
// Larghezza di una card più lo spazio dopo di lei (dal CSS,
// .hero-carosello-card + gap) — usata per tutti i calcoli di
// posizione dello scroll qui sotto.
const LARGHEZZA_CARD_CAROSELLO = 256;

export function HomePage() {
  const caroselloRef = useRef<HTMLDivElement>(null);
  function scorriCarosello(direzione: 1 | -1) {
    caroselloRef.current?.scrollBy({ left: direzione * 600, behavior: 'smooth' });
  }
  const caroselloHeroRef = useRef<HTMLDivElement>(null);
  const [eventoCentraleId, setEventoCentraleId] = useState<string | null>(null);
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
    });
  }, []);
  const t = (chiave: string, valoreDefault: string) => testiHero[chiave] || valoreDefault;

  // Quale card è più vicina al centro del carosello — ricalcolato ogni
  // volta che si scorre (a mano o da soli, ogni 2 secondi), non solo
  // all'avvio: così la card "in primo piano" resta sempre quella
  // davvero al centro, anche scorrendo col dito.
  function aggiornaCardCentrale() {
    const contenitore = caroselloHeroRef.current;
    if (!contenitore) return;
    const centroContenitore = contenitore.getBoundingClientRect().left + contenitore.clientWidth / 2;
    let vicinaId: string | null = null;
    let distanzaMinima = Infinity;
    for (const card of Array.from(contenitore.children)) {
      const rect = (card as HTMLElement).getBoundingClientRect();
      const centroCard = rect.left + rect.width / 2;
      const distanza = Math.abs(centroCard - centroContenitore);
      if (distanza < distanzaMinima) {
        distanzaMinima = distanza;
        vicinaId = (card as HTMLElement).dataset.eventoId ?? null;
      }
    }
    setEventoCentraleId(vicinaId);
  }
  // Il cuore dell'effetto "giro infinito" — appena lo scroll (manuale o
  // automatico, non importa: questa funzione gira a ogni scroll
  // qualunque ne sia la causa) entra nella zona clonata a un capo,
  // salta all'istante (nessuna animazione — invisibile all'occhio) al
  // punto corrispondente tra le card vere, dall'altro capo. Chi guarda
  // vede solo un giro che non finisce mai, mai uno scatto indietro.
  function salvaguardiaGiroInfinito() {
    const el = caroselloHeroRef.current;
    if (!el || eventi.length < SOGLIA_MINIMA_GIRO_INFINITO) return;
    const numCloni = Math.min(NUM_CLONI_CAROSELLO, eventi.length);
    const inizioZonaVera = numCloni * LARGHEZZA_CARD_CAROSELLO;
    const fineZonaVera = inizioZonaVera + eventi.length * LARGHEZZA_CARD_CAROSELLO;
    const unGiro = eventi.length * LARGHEZZA_CARD_CAROSELLO;
    if (el.scrollLeft >= fineZonaVera) {
      el.scrollLeft -= unGiro;
    } else if (el.scrollLeft < inizioZonaVera) {
      el.scrollLeft += unGiro;
    }
  }
  useEffect(() => {
    const contenitore = caroselloHeroRef.current;
    if (!contenitore) return;
    function alloScroll() {
      aggiornaCardCentrale();
    }
    // "scrollend" (non il normale "scroll") apposta — controllare il
    // salto a OGNI istante dello scorrimento, mentre l'animazione
    // "smooth" è ancora in corso, rischierebbe di interromperla a
    // metà con uno scatto visibile. Aspettando che lo scroll si sia
    // davvero fermato, il salto (quando serve) è pulito e invisibile.
    function alloScrollFermo() {
      salvaguardiaGiroInfinito();
    }
    contenitore.addEventListener('scroll', alloScroll, { passive: true });
    contenitore.addEventListener('scrollend', alloScrollFermo, { passive: true });
    // Parte già dalla prima card vera (salta i cloni iniziali) — mai
    // dallo zero assoluto, che mostrerebbe prima i cloni.
    const numCloni = eventi.length < SOGLIA_MINIMA_GIRO_INFINITO ? 0 : Math.min(NUM_CLONI_CAROSELLO, eventi.length);
    contenitore.scrollLeft = numCloni * LARGHEZZA_CARD_CAROSELLO;
    aggiornaCardCentrale();
    return () => {
      contenitore.removeEventListener('scroll', alloScroll);
      contenitore.removeEventListener('scrollend', alloScrollFermo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventi.length]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [eventoInCheckout, setEventoInCheckout] = useState<Evento | null>(null);

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
  // (invece di restare bloccato contro il bordo destro). In pausa
  // finché il cliente ci passa sopra col mouse (desktop) o lo tocca
  // (mobile) — così lo scorrimento automatico non gli porta via da
  // sotto l'evento che sta guardando/scegliendo.
  const inPausaCarosello = useRef(false);
  const timerRipresaCarosello = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Su mobile il tocco mette in pausa ma non c'è un "esco col mouse"
  // che la tolga da solo come su desktop — qui la si toglie da sola
  // dopo qualche secondo senza altre interazioni, così il carosello
  // riprende a girare dopo che il cliente ha guardato/scelto l'evento,
  // invece di restare fermo per sempre.
  function pianificaRipresaCarosello() {
    if (timerRipresaCarosello.current) clearTimeout(timerRipresaCarosello.current);
    timerRipresaCarosello.current = setTimeout(() => { inPausaCarosello.current = false; }, 3000);
  }
  useEffect(() => {
    if (eventi.length < 2) return;
    const intervallo = setInterval(() => {
      if (inPausaCarosello.current) return;
      const el = caroselloHeroRef.current;
      if (!el) return;
      // Avanza sempre, mai un controllo "sono alla fine?" qui — il
      // giro infinito (cloni + salto invisibile, vedi
      // salvaguardiaGiroInfinito più sopra, agganciata allo scroll)
      // se ne occupa da sola qualunque sia la posizione attuale.
      el.scrollBy({ left: LARGHEZZA_CARD_CAROSELLO, behavior: 'smooth' });
    }, 2000);
    return () => clearInterval(intervallo);
  }, [eventi.length]);
  const [searchParams, setSearchParams] = useSearchParams();
  const ricercaTesto = searchParams.get('q') ?? '';
  const genereAttivo = searchParams.get('genere') ?? 'Tutti';
  function setGenereAttivo(g: string) {
    const nuovi = new URLSearchParams(searchParams);
    if (g === 'Tutti') nuovi.delete('genere'); else nuovi.set('genere', g);
    setSearchParams(nuovi, { replace: true });
  }
  // Le 3 categorie fisse dei pulsanti in alto sul sito — diverse dal
  // "genere" qui sopra (quello resta libero, i filtri poco più sotto
  // nella pagina). Parametro separato apposta, così i due filtri non
  // si accavallano mai per coincidenza.
  const categoriaAttiva = searchParams.get('categoria');
  // Le categorie servono qui — non solo nell'header — per il primo
  // livello della cascata sotto: Tutti → Categorie → Generi.
  const [categorie, setCategorie] = useState<CategoriaEvento[]>([]);
  useEffect(() => { categorieEventoApi.list().then(setCategorie); }, []);
  function impostaCategoria(nome: string) {
    const nuovi = new URLSearchParams(searchParams);
    if (nome === 'Tutti') { nuovi.delete('categoria'); nuovi.delete('genere'); } else { nuovi.set('categoria', nome); nuovi.delete('genere'); }
    setSearchParams(nuovi, { replace: true });
  }
  // I generi mostrati qui sono SOLO quelli davvero presenti tra gli
  // eventi della categoria selezionata — se clicchi "Festival" e c'è
  // solo un evento Techno, vedi solo "Techno" come filtro genere, non
  // tutti i generi esistenti nel sito (che magari appartengono a
  // eventi di un'altra categoria, irrilevanti qui).
  const eventiDellaCategoria = useMemo(
    () => categoriaAttiva ? eventi.filter((e) => e.categoria === categoriaAttiva) : eventi,
    [eventi, categoriaAttiva]
  );
  const generi = useMemo(() => ['Tutti', ...new Set(eventiDellaCategoria.map((e) => e.genere))], [eventiDellaCategoria]);
  const eventiFiltrati = useMemo(() => {
    let lista = genereAttivo === 'Tutti' ? eventi : eventi.filter((e) => e.genere === genereAttivo);
    if (categoriaAttiva) lista = lista.filter((e) => e.categoria === categoriaAttiva);
    // Normalizza per il confronto: minuscolo + senza accenti (così
    // "citta" trova anche "città") — usata sia sul testo cercato sia
    // sui campi dell'evento.
    const normalizza = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const parole = normalizza(ricercaTesto.trim()).split(/\s+/).filter(Boolean);
    if (parole.length) {
      lista = lista.filter((e) => {
        // Tutto il testo cercabile di un evento, unito in un solo
        // blocco — ogni parola cercata deve trovarsi DA QUALCHE PARTE
        // qui dentro, non necessariamente tutte nello stesso campo:
        // "Milano concerto" deve trovare un evento anche se "Milano"
        // è solo nella fermata e "concerto" solo nel nome artista.
        const testo = normalizza([
          e.artista, e.citta, e.luogo,
          ...[...e.tragitti, ...e.servizi.flatMap((v) => v.tragitti)].flatMap((l) => l.fermate.map((f) => f.citta)),
        ].join(' '));
        return parole.every((p) => testo.includes(p));
      });
    }
    // Ordine cronologico sempre garantito qui, esplicitamente — non ci
    // si affida al solo ordine con cui arrivano dal server.
    return [...lista].sort((a, b) => a.data.localeCompare(b.data));
  }, [eventi, genereAttivo, categoriaAttiva, ricercaTesto]);

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
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">{t('hero_eyebrow', 'Bus per concerti in tutta Italia')}</div>
            <h1 className="hero-title"><span>{t('hero_titolo_riga1', 'Sali sul bus.')}</span><span className="line2">{t('hero_titolo_riga2', 'Vivi il concerto.')}</span></h1>
            <p className="hero-sub">{t('hero_sottotitolo', 'Andata e ritorno in giornata, direttamente dalla tua città al palco del tuo artista preferito. Un solo biglietto, zero pensieri.')}</p>
            <div className="hero-stats">
              <div className="stat"><b>{numeroPartenze}</b><span>{t('hero_statistica1_etichetta', 'Partenze attive')}</span></div>
              <div className="stat"><b>{cittaPartenza.length}</b><span>{t('hero_statistica2_etichetta', 'Città di partenza')}</span></div>
            </div>
          </div>

          {/* Tutti gli eventi, che scorrono da soli ogni 2 secondi —
              al posto del vecchio modulo di ricerca, ora spostato sopra. */}
          <div className="hero-carosello-wrap">
            <div
              className="hero-carosello"
              ref={caroselloHeroRef}
              onMouseEnter={() => { inPausaCarosello.current = true; if (timerRipresaCarosello.current) clearTimeout(timerRipresaCarosello.current); }}
              onMouseLeave={() => { inPausaCarosello.current = false; }}
              onTouchStart={() => {
                inPausaCarosello.current = true;
                // Rete di sicurezza: la ripresa parte già da qui, non
                // solo al rilascio del dito (onTouchEnd, sotto) — su
                // alcuni telefoni quell'evento può non arrivare in modo
                // pulito (es. lo scroll del dito viene interpretato
                // diversamente dal browser). Così il carosello riparte
                // comunque entro 3 secondi al massimo dal tocco,
                // qualunque cosa succeda dopo.
                pianificaRipresaCarosello();
              }}
              onTouchEnd={pianificaRipresaCarosello}
              onClick={pianificaRipresaCarosello}
            >
              {(() => {
                // Cloni a inizio e fine — la stessa card ripetuta, mai
                // più di quante ce ne sono davvero. Servono solo per
                // l'illusione visiva: appena lo scroll ci entra dentro,
                // si salta all'istante (senza animazione, invisibile)
                // al punto corrispondente tra le card vere, dando
                // l'effetto di un giro infinito senza soluzione di
                // continuità, invece di uno scatto indietro a fine giro.
                const numCloni = eventi.length < SOGLIA_MINIMA_GIRO_INFINITO ? 0 : Math.min(NUM_CLONI_CAROSELLO, eventi.length);
                const cloniInizio = (numCloni === 0 ? [] : eventi.slice(-numCloni)).map((ev, i) => ({ ev, chiave: `clone-inizio-${i}-${ev.id}` }));
                const veri = eventi.map((ev) => ({ ev, chiave: ev.id }));
                const cloniFine = eventi.slice(0, numCloni).map((ev, i) => ({ ev, chiave: `clone-fine-${i}-${ev.id}` }));
                return [...cloniInizio, ...veri, ...cloniFine].map(({ ev, chiave }) => (
                  <div key={chiave} data-evento-id={ev.id} className={`hero-carosello-card${ev.id === eventoCentraleId ? ' centro' : ''}`}>
                    <EventoCard evento={ev} />
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </section>

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
            {/* Riflette la cascata di filtri già esistente
                (categoria→genere) — ogni passaggio tranne l'ultimo è
                cliccabile per tornare indietro di un livello. */}
            <nav aria-label="Percorso" className="breadcrumb">
              <a href="#eventi" onClick={(e) => { e.preventDefault(); setSearchParams((p) => { p.delete('categoria'); p.delete('genere'); return p; }); }}>
                Tutti gli eventi
              </a>
              {categoriaAttiva && (
                <>
                  <span className="breadcrumb-separatore">›</span>
                  {genereAttivo !== 'Tutti' ? (
                    <a href="#eventi" onClick={(e) => { e.preventDefault(); setSearchParams((p) => { p.delete('genere'); return p; }); }}>
                      {categoriaAttiva}
                    </a>
                  ) : (
                    <span aria-current="page">{categoriaAttiva}</span>
                  )}
                </>
              )}
              {categoriaAttiva && genereAttivo !== 'Tutti' && (
                <>
                  <span className="breadcrumb-separatore">›</span>
                  <span aria-current="page">{genereAttivo}</span>
                </>
              )}
            </nav>
            <p className="section-sub">Scegli il concerto, scegli la tua fermata, il resto lo pensiamo noi.</p>
          </div>
        </div>
        <div className="filter-bar">
          {!categoriaAttiva ? (
            // Primo livello della cascata — nessuna categoria ancora
            // scelta: si vedono le categorie, non i generi (che
            // avrebbero poco senso mischiati tra categorie diverse).
            <>
              <button className="chip active" disabled>Tutti</button>
              {categorie.map((c) => (
                <button key={c.id} className="chip" onClick={() => impostaCategoria(c.nome)}>{c.nome}</button>
              ))}
            </>
          ) : (
            // Secondo livello — una categoria è scelta: ora si vedono i
            // generi presenti SOLO in quella categoria. "Tutti" qui
            // azzera il genere (resta comunque dentro la categoria
            // scelta — per uscirne del tutto si usa il pulsante
            // categoria nell'header, sopra).
            generi.map((g) => (
              <button key={g} className={`chip${g === genereAttivo ? ' active' : ''}`} onClick={() => setGenereAttivo(g)}>
                {g === 'Tutti' ? <b>{categoriaAttiva}</b> : g}
              </button>
            ))
          )}
        </div>

        {caricamento && <p style={{ color: 'var(--mist)', padding: 40, textAlign: 'center' }}>Carico gli eventi...</p>}
        {errore && <p className="errore" style={{ padding: 40, textAlign: 'center' }}>{errore}</p>}
        {!caricamento && !errore && !eventiFiltrati.length && (
          <p style={{ color: 'var(--mist)', padding: 40, textAlign: 'center' }}>Nessun evento per questo filtro.</p>
        )}
        <div className="carosello-wrap">
          <div className="carosello carosello-compatto">
            {eventiFiltrati.map((ev) => <EventoCard key={ev.id} evento={ev} />)}
          </div>
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
