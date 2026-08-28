import { useEffect, useRef, useState } from 'react';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../api/layoutBiglietto';
import { PanelHead } from '../shared/PanelHead';
import { CaricaFile } from '../shared/CaricaFile';

type SezioneBiglietto = 'intestazione_immagine' | 'titolo' | 'evento' | 'partenza' | 'passeggero' | 'pnr' | 'qr' | 'nota';

const ETICHETTE_SEZIONI: Record<SezioneBiglietto, string> = {
  intestazione_immagine: 'Immagine di intestazione',
  titolo: 'Titolo evento',
  evento: 'Dettagli evento',
  partenza: 'Dettagli partenza',
  passeggero: 'Dati passeggero',
  pnr: 'Codice prenotazione (PNR)',
  qr: 'QR code',
  nota: 'Nota finale',
};
const TUTTE_LE_SEZIONI = Object.keys(ETICHETTE_SEZIONI) as SezioneBiglietto[];

interface Posizione { x: number; y: number; larghezza: number; altezza: number }
interface ImmagineExtra { id: string; url: string; posizione: Posizione }
interface Sfumatura {
  attiva: boolean;
  tipo: 'lineare' | 'radiale';
  colore: string;
  direzioneGradi: number;
  raggio: number;
  opacita: number;
}
interface Configurazione {
  coloreAccento: string;
  coloreSfondo: string;
  posizioni: Record<SezioneBiglietto, Posizione>;
  immaginiExtra: ImmagineExtra[];
  qr: { dimensione: number };
  sfondoImmagineUrl: string | null;
  sfumatura: Sfumatura;
  spaziaturaSezioni: number;
}

const POSIZIONI_DEFAULT: Record<SezioneBiglietto, Posizione> = {
  intestazione_immagine: { x: 0, y: 0, larghezza: 100, altezza: 22 },
  titolo: { x: 8, y: 26, larghezza: 84, altezza: 9 },
  evento: { x: 8, y: 37, larghezza: 84, altezza: 15 },
  partenza: { x: 8, y: 54, larghezza: 84, altezza: 8 },
  passeggero: { x: 8, y: 64, larghezza: 84, altezza: 8 },
  pnr: { x: 8, y: 74, larghezza: 84, altezza: 8 },
  qr: { x: 35, y: 82, larghezza: 30, altezza: 15 },
  nota: { x: 8, y: 92, larghezza: 84, altezza: 6 },
};
const CONFIG_DEFAULT: Configurazione = {
  coloreAccento: '#111111',
  coloreSfondo: '#ffffff',
  posizioni: POSIZIONI_DEFAULT,
  immaginiExtra: [],
  qr: { dimensione: 33 },
  sfondoImmagineUrl: null,
  sfumatura: { attiva: false, tipo: 'lineare', colore: '#ffffff', direzioneGradi: 90, raggio: 60, opacita: 0.6 },
  spaziaturaSezioni: 1,
};

function analizzaConfigurazione(testo: string): Configurazione {
  try {
    const c = JSON.parse(testo);
    const posizioni = { ...POSIZIONI_DEFAULT };
    if (c.posizioni && typeof c.posizioni === 'object') {
      for (const s of TUTTE_LE_SEZIONI) {
        const p = c.posizioni[s];
        if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.larghezza === 'number' && typeof p.altezza === 'number') {
          posizioni[s] = p;
        }
      }
    }
    return {
      coloreAccento: typeof c.coloreAccento === 'string' ? c.coloreAccento : CONFIG_DEFAULT.coloreAccento,
      coloreSfondo: typeof c.coloreSfondo === 'string' ? c.coloreSfondo : '#ffffff',
      posizioni,
      immaginiExtra: Array.isArray(c.immaginiExtra) ? c.immaginiExtra.filter((i: unknown): i is ImmagineExtra => {
        const x = i as Partial<ImmagineExtra>;
        return !!x && typeof x.id === 'string' && typeof x.url === 'string' && !!x.posizione;
      }) : [],
      qr: { dimensione: typeof c.qr?.dimensione === 'number' ? c.qr.dimensione : CONFIG_DEFAULT.qr.dimensione },
      sfondoImmagineUrl: typeof c.sfondoImmagineUrl === 'string' ? c.sfondoImmagineUrl : null,
      sfumatura: c.sfumatura && typeof c.sfumatura === 'object' ? { ...CONFIG_DEFAULT.sfumatura, ...c.sfumatura } : CONFIG_DEFAULT.sfumatura,
      spaziaturaSezioni: typeof c.spaziaturaSezioni === 'number' ? c.spaziaturaSezioni : 1,
    };
  } catch {
    return CONFIG_DEFAULT;
  }
}

const RAPPORTO_A5 = 420 / 595;
const LARGHEZZA_CANVAS = 380;
const ALTEZZA_CANVAS = LARGHEZZA_CANVAS / RAPPORTO_A5;

/** Le 4 maniglie d'angolo di un elemento selezionato — ognuna avvia il
 *  ridimensionamento dal proprio angolo (l'angolo opposto resta fermo
 *  come "perno"), per un ridimensionamento libero in ogni direzione
 *  invece che solo dal basso a destra. */
function ManigliaAngoli({ colore, onInizia }: { colore: string; onInizia: (e: React.MouseEvent, angolo: 'nw' | 'ne' | 'sw' | 'se') => void }) {
  const stileBase: React.CSSProperties = { position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: colore, border: '2px solid #fff' };
  return (
    <>
      <div onMouseDown={(e) => onInizia(e, 'nw')} style={{ ...stileBase, left: -5, top: -5, cursor: 'nwse-resize' }} />
      <div onMouseDown={(e) => onInizia(e, 'ne')} style={{ ...stileBase, right: -5, top: -5, cursor: 'nesw-resize' }} />
      <div onMouseDown={(e) => onInizia(e, 'sw')} style={{ ...stileBase, left: -5, bottom: -5, cursor: 'nesw-resize' }} />
      <div onMouseDown={(e) => onInizia(e, 'se')} style={{ ...stileBase, right: -5, bottom: -5, cursor: 'nwse-resize' }} />
    </>
  );
}

export function LayoutBigliettoScreen() {
  const [lista, setLista] = useState<LayoutBiglietto[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [selezionato, setSelezionato] = useState<LayoutBiglietto | null>(null);
  const [nome, setNome] = useState('');
  const [config, setConfig] = useState<Configurazione>(CONFIG_DEFAULT);
  const [salvando, setSalvando] = useState(false);
  const [generandoAnteprima, setGenerandoAnteprima] = useState(false);
  // "sezione:titolo" per una sezione fissa, "extra:ID" per un logo
  // aggiunto — un solo stato per entrambi, così il resto del codice
  // (trascinamento, ridimensionamento) è lo stesso per entrambi i tipi.
  const [attivoId, setAttivoId] = useState<string | null>(null);
  // Griglia — solo visiva, aiuta a valutare gli spazi a colpo d'occhio,
  // attivabile/disattivabile perché con lo sfondo carico può disturbare.
  const [mostraGriglia, setMostraGriglia] = useState(true);
  // Linee guida "intelligenti" (come Figma/Canva/PowerPoint) — appaiono
  // solo MENTRE trascini o ridimensioni, quando un bordo o il centro
  // dell'elemento attivo si allinea con quello di un altro elemento, o
  // con il centro/i bordi della pagina — e l'elemento si "aggancia" lì
  // da solo, per allineamenti sempre precisi senza doverlo fare a
  // occhio pixel per pixel.
  const [guideAttive, setGuideAttive] = useState<{ verticali: number[]; orizzontali: number[] }>({ verticali: [], orizzontali: [] });

  const canvasRef = useRef<HTMLDivElement>(null);
  const trascinamento = useRef<{ id: string; modo: 'sposta' | 'ridimensiona-nw' | 'ridimensiona-ne' | 'ridimensiona-sw' | 'ridimensiona-se'; inizioMouseX: number; inizioMouseY: number; posizioneIniziale: Posizione } | null>(null);

  function ricarica() {
    setCaricamento(true);
    setErrore('');
    layoutBigliettoApi.list()
      .then((l) => {
        setLista(l);
        setSelezionato((sel) => sel ? (l.find((x) => x.id === sel.id) ?? null) : null);
      })
      .catch(() => setErrore('Impossibile caricare i layout. Controlla i tuoi permessi o riprova.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(ricarica, []);

  function apri(l: LayoutBiglietto) {
    setSelezionato(l);
    setNome(l.nome);
    setConfig(analizzaConfigurazione(l.configurazione));
    setAttivoId(null);
  }
  function nuovo() {
    setSelezionato(null);
    setNome('Nuovo layout');
    setConfig(CONFIG_DEFAULT);
    setAttivoId(null);
  }

  async function salva() {
    if (!nome.trim()) { alert('Dai un nome al layout prima di salvare.'); return; }
    setSalvando(true);
    try {
      const configurazione = JSON.stringify(config);
      if (selezionato) {
        await layoutBigliettoApi.aggiorna(selezionato.id, { nome, configurazione });
      } else {
        const creato = await layoutBigliettoApi.crea({ nome, configurazione });
        setSelezionato(creato);
      }
      ricarica();
    } catch (e) {
      alert(e instanceof Error ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito.');
    } finally {
      setSalvando(false);
    }
  }
  async function anteprima() {
    setGenerandoAnteprima(true);
    try {
      await layoutBigliettoApi.scaricaAnteprima(JSON.stringify(config));
    } catch (e) {
      alert(e instanceof Error ? `Anteprima non riuscita: ${e.message}` : 'Anteprima non riuscita.');
    } finally {
      setGenerandoAnteprima(false);
    }
  }
  async function impostaPredefinito() {
    if (!selezionato) return;
    await layoutBigliettoApi.impostaPredefinito(selezionato.id);
    ricarica();
  }
  async function elimina() {
    if (!selezionato) return;
    if (!confirm(`Eliminare il layout "${selezionato.nome}"? Gli eventi che lo usavano torneranno a quello predefinito.`)) return;
    try {
      await layoutBigliettoApi.elimina(selezionato.id);
      setSelezionato(null);
      ricarica();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Eliminazione non riuscita.');
    }
  }

  function posizioneDi(id: string): Posizione {
    if (id.startsWith('extra:')) {
      const extraId = id.slice(6);
      return config.immaginiExtra.find((i) => i.id === extraId)?.posizione ?? { x: 10, y: 10, larghezza: 20, altezza: 20 };
    }
    return config.posizioni[id as SezioneBiglietto];
  }
  function aggiornaPosizione(id: string, nuova: Partial<Posizione>) {
    if (id.startsWith('extra:')) {
      const extraId = id.slice(6);
      setConfig((c) => ({ ...c, immaginiExtra: c.immaginiExtra.map((i) => i.id === extraId ? { ...i, posizione: { ...i.posizione, ...nuova } } : i) }));
    } else {
      const sezione = id as SezioneBiglietto;
      setConfig((c) => ({ ...c, posizioni: { ...c.posizioni, [sezione]: { ...c.posizioni[sezione], ...nuova } } }));
    }
  }
  function aggiungiLogo(url: string) {
    const id = `logo-${Date.now()}`;
    setConfig((c) => ({ ...c, immaginiExtra: [...c.immaginiExtra, { id, url, posizione: { x: 10, y: 10, larghezza: 25, altezza: 12 } }] }));
    setAttivoId(`extra:${id}`);
  }
  function rimuoviLogoAttivo() {
    if (!attivoId?.startsWith('extra:')) return;
    const extraId = attivoId.slice(6);
    setConfig((c) => ({ ...c, immaginiExtra: c.immaginiExtra.filter((i) => i.id !== extraId) }));
    setAttivoId(null);
  }

  function iniziaTrascinamento(e: React.MouseEvent, id: string, modo: 'sposta' | 'ridimensiona-nw' | 'ridimensiona-ne' | 'ridimensiona-sw' | 'ridimensiona-se') {
    e.preventDefault();
    e.stopPropagation();
    setAttivoId(id);
    trascinamento.current = { id, modo, inizioMouseX: e.clientX, inizioMouseY: e.clientY, posizioneIniziale: { ...posizioneDi(id) } };
    window.addEventListener('mousemove', duranteTrascinamento);
    window.addEventListener('mouseup', fineTrascinamento);
  }
  // Tutti gli elementi ATTUALMENTE sul canvas, tranne quello che si sta
  // trascinando — sono i "candidati" contro cui controllare gli
  // allineamenti. Le posizioni della pagina (bordi e centro) sono
  // sempre candidate a parte, aggiunte a valle di questa funzione.
  function posizioniAltriElementi(idEscluso: string): Posizione[] {
    const risultato: Posizione[] = [];
    for (const s of TUTTE_LE_SEZIONI) if (s !== idEscluso) risultato.push(config.posizioni[s]);
    for (const extra of config.immaginiExtra) if (`extra:${extra.id}` !== idEscluso) risultato.push(extra.posizione);
    return risultato;
  }
  const SOGLIA_AGGANCIO = 0.8; // punti percentuale del canvas — abbastanza stretta da non "tirare" involontariamente, abbastanza larga da agganciare senza doverci mirare al pixel
  /** Confronta i bordi/centro dell'elemento in movimento con quelli di
   *  tutti gli altri elementi e con bordi/centro della pagina — se
   *  qualcuno è abbastanza vicino (sotto la soglia), restituisce la
   *  correzione da applicare (l'aggancio vero e proprio) e le
   *  coordinate delle linee guida da disegnare. */
  function calcolaAggancio(idAttivo: string, pos: Posizione, modo: 'sposta' | 'ridimensiona-nw' | 'ridimensiona-ne' | 'ridimensiona-sw' | 'ridimensiona-se') {
    const altri = posizioniAltriElementi(idAttivo);
    const candidatiX = [0, 50, 100, ...altri.flatMap((p) => [p.x, p.x + p.larghezza / 2, p.x + p.larghezza])];
    const candidatiY = [0, 50, 100, ...altri.flatMap((p) => [p.y, p.y + p.altezza / 2, p.y + p.altezza])];

    // In "sposta" controlliamo i 3 bordi/centro orizzontali e verticali
    // dell'elemento; ridimensionando da un angolo, solo il bordo che
    // quell'angolo sta davvero muovendo (es. dall'angolo in alto a
    // sinistra si muovono il bordo sinistro e quello superiore, gli
    // altri due restano fermi).
    const puntiXPropri = modo === 'sposta'
      ? [pos.x, pos.x + pos.larghezza / 2, pos.x + pos.larghezza]
      : (modo === 'ridimensiona-nw' || modo === 'ridimensiona-sw') ? [pos.x] : [pos.x + pos.larghezza];
    const puntiYPropri = modo === 'sposta'
      ? [pos.y, pos.y + pos.altezza / 2, pos.y + pos.altezza]
      : (modo === 'ridimensiona-nw' || modo === 'ridimensiona-ne') ? [pos.y] : [pos.y + pos.altezza];

    let correzioneX = 0;
    let correzioneY = 0;
    const guideV: number[] = [];
    const guideH: number[] = [];

    for (const valore of puntiXPropri) {
      let migliore: number | null = null;
      for (const c of candidatiX) if (Math.abs(valore - c) < SOGLIA_AGGANCIO && (migliore === null || Math.abs(valore - c) < Math.abs(valore - migliore))) migliore = c;
      if (migliore !== null) { correzioneX = migliore - valore; guideV.push(migliore); break; } // un solo aggancio orizzontale alla volta, il primo trovato
    }
    for (const valore of puntiYPropri) {
      let migliore: number | null = null;
      for (const c of candidatiY) if (Math.abs(valore - c) < SOGLIA_AGGANCIO && (migliore === null || Math.abs(valore - c) < Math.abs(valore - migliore))) migliore = c;
      if (migliore !== null) { correzioneY = migliore - valore; guideH.push(migliore); break; }
    }

    return { correzioneX, correzioneY, guideV, guideH };
  }

  function duranteTrascinamento(e: MouseEvent) {
    const t = trascinamento.current;
    if (!t || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const deltaXPercento = ((e.clientX - t.inizioMouseX) / rect.width) * 100;
    const deltaYPercento = ((e.clientY - t.inizioMouseY) / rect.height) * 100;

    if (t.modo === 'sposta') {
      const nuovaX = Math.max(0, Math.min(100 - t.posizioneIniziale.larghezza, t.posizioneIniziale.x + deltaXPercento));
      const nuovaY = Math.max(0, Math.min(100 - t.posizioneIniziale.altezza, t.posizioneIniziale.y + deltaYPercento));
      const bozza = { x: nuovaX, y: nuovaY, larghezza: t.posizioneIniziale.larghezza, altezza: t.posizioneIniziale.altezza };
      const { correzioneX, correzioneY, guideV, guideH } = calcolaAggancio(t.id, bozza, 'sposta');
      setGuideAttive({ verticali: guideV, orizzontali: guideH });
      aggiornaPosizione(t.id, { x: nuovaX + correzioneX, y: nuovaY + correzioneY });
    } else {
      // I 4 angoli si comportano diversamente: da quello in alto a
      // sinistra si muovono sia il bordo sinistro che quello
      // superiore (l'angolo opposto, in basso a destra, resta fermo);
      // dagli altri 3 angoli, solo i due bordi corrispondenti.
      const p0 = t.posizioneIniziale;
      const bordoDestroFisso = p0.x + p0.larghezza;
      const bordoBassoFisso = p0.y + p0.altezza;
      const muoveSinistra = t.modo === 'ridimensiona-nw' || t.modo === 'ridimensiona-sw';
      const muoveAlto = t.modo === 'ridimensiona-nw' || t.modo === 'ridimensiona-ne';

      let nuovaX = p0.x;
      let nuovaLarghezza = p0.larghezza;
      if (muoveSinistra) {
        nuovaX = Math.max(0, Math.min(bordoDestroFisso - 6, p0.x + deltaXPercento));
        nuovaLarghezza = bordoDestroFisso - nuovaX;
      } else {
        nuovaLarghezza = Math.max(6, Math.min(100 - p0.x, p0.larghezza + deltaXPercento));
      }
      let nuovaY = p0.y;
      let nuovaAltezza = p0.altezza;
      if (muoveAlto) {
        nuovaY = Math.max(0, Math.min(bordoBassoFisso - 4, p0.y + deltaYPercento));
        nuovaAltezza = bordoBassoFisso - nuovaY;
      } else {
        nuovaAltezza = Math.max(4, Math.min(100 - p0.y, p0.altezza + deltaYPercento));
      }

      const bozza = { x: nuovaX, y: nuovaY, larghezza: nuovaLarghezza, altezza: nuovaAltezza };
      const { correzioneX, correzioneY, guideV, guideH } = calcolaAggancio(t.id, bozza, t.modo);
      setGuideAttive({ verticali: guideV, orizzontali: guideH });

      const xFinale = muoveSinistra ? nuovaX + correzioneX : nuovaX;
      const larghezzaFinale = muoveSinistra ? bordoDestroFisso - xFinale : nuovaLarghezza + correzioneX;
      const yFinale = muoveAlto ? nuovaY + correzioneY : nuovaY;
      const altezzaFinale = muoveAlto ? bordoBassoFisso - yFinale : nuovaAltezza + correzioneY;

      aggiornaPosizione(t.id, { x: xFinale, y: yFinale, larghezza: larghezzaFinale, altezza: altezzaFinale });
    }
  }
  function fineTrascinamento() {
    trascinamento.current = null;
    setGuideAttive({ verticali: [], orizzontali: [] });
    window.removeEventListener('mousemove', duranteTrascinamento);
    window.removeEventListener('mouseup', fineTrascinamento);
  }
  useEffect(() => () => {
    window.removeEventListener('mousemove', duranteTrascinamento);
    window.removeEventListener('mouseup', fineTrascinamento);
  }, []);

  if (caricamento) return <p className="testo-intro">Carico...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  return (
    <div>
      <PanelHead titolo="Layout biglietto" azione={<button type="button" className="btn btn-primary" onClick={nuovo}>+ Nuovo layout</button>} />
      <p className="testo-intro" style={{ marginBottom: 16 }}>
        Trascina ogni sezione dove vuoi sul biglietto; trascina l'angolo in basso a destra per ridimensionarla — mentre trascini, delle linee rosa ti avvisano quando ti allinei con un altro elemento o con centro/bordi della pagina, e ci si "aggancia" da sole per allineamenti sempre precisi. Ogni evento usa il layout <b>predefinito</b> a meno che, dalla sua scheda, tu non ne scelga uno diverso.
      </p>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map((l) => (
            <button
              key={l.id} type="button" onClick={() => apri(l)} className="riga-cliccabile"
              style={{ textAlign: 'left', border: 'none', width: '100%', cursor: 'pointer', background: selezionato?.id === l.id ? 'var(--dusk-2)' : undefined }}
            >
              <span className="riga-titolo" style={{ fontSize: 13.5 }}>
                {l.nome} {l.predefinito && <span className="badge coperta" style={{ marginLeft: 6 }}>Predefinito</span>}
              </span>
            </button>
          ))}
          {lista.length === 0 && <p className="testo-intro" style={{ fontSize: 13 }}>Nessun layout ancora — creane uno.</p>}
        </div>

        {(selezionato || nome) && (
          <>
            <div style={{ flex: '0 0 auto', position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <button
                  type="button"
                  className={`btn btn-ghost${mostraGriglia ? ' active' : ''}`}
                  style={{ fontSize: 12 }}
                  onClick={() => setMostraGriglia((v) => !v)}
                  title="Mostra/nascondi la griglia di riferimento sul canvas"
                >
                  ⊞ Griglia {mostraGriglia ? 'attiva' : 'disattivata'}
                </button>
              </div>
              <div
                ref={canvasRef}
                onMouseDown={() => setAttivoId(null)}
                style={{
                  position: 'relative', width: LARGHEZZA_CANVAS, height: ALTEZZA_CANVAS,
                  background: config.sfondoImmagineUrl ? `url(${config.sfondoImmagineUrl}) center/cover, ${config.coloreSfondo}` : config.coloreSfondo,
                  border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 10px 30px -10px rgba(0,0,0,.4)',
                }}
              >
                {/* Griglia di riferimento — solo visiva, mai stampata sul
                    biglietto vero, serve solo per valutare a colpo
                    d'occhio spazi e margini mentre componi il layout. */}
                {mostraGriglia && (
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px)',
                    backgroundSize: '10% 10%',
                  }} />
                )}
                {/* Linee guida "intelligenti" — appaiono solo mentre si
                    trascina/ridimensiona un elemento, quando si allinea
                    con un altro elemento o con centro/bordi pagina. Zindex
                    alto apposta: devono sempre stare sopra agli elementi,
                    a differenza della griglia sopra (che invece deve
                    restare sotto, sfrutta solo l'ordine naturale nel DOM). */}
                {guideAttive.verticali.map((x, i) => (
                  <div key={`v${i}`} style={{ position: 'absolute', left: `${x}%`, top: 0, bottom: 0, width: 1, background: 'var(--pink)', zIndex: 50, pointerEvents: 'none' }} />
                ))}
                {guideAttive.orizzontali.map((y, i) => (
                  <div key={`h${i}`} style={{ position: 'absolute', top: `${y}%`, left: 0, right: 0, height: 1, background: 'var(--pink)', zIndex: 50, pointerEvents: 'none' }} />
                ))}
                {/* Sfumatura — anteprima approssimata via gradiente CSS, il PDF vero usa la stessa direzione/colore/raggio con la formula esatta di PDFKit */}
                {config.sfumatura.attiva && (
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: config.sfumatura.tipo === 'lineare'
                      ? `linear-gradient(${config.sfumatura.direzioneGradi}deg, transparent, ${config.sfumatura.colore}${Math.round(config.sfumatura.opacita * 255).toString(16).padStart(2, '0')})`
                      : `radial-gradient(circle ${config.sfumatura.raggio}% at center, transparent, ${config.sfumatura.colore}${Math.round(config.sfumatura.opacita * 255).toString(16).padStart(2, '0')})`,
                  }} />
                )}

                {config.immaginiExtra.map((extra) => {
                  const id = `extra:${extra.id}`;
                  const attivo = attivoId === id;
                  return (
                    <div
                      key={id}
                      onMouseDown={(e) => iniziaTrascinamento(e, id, 'sposta')}
                      style={{
                        position: 'absolute',
                        left: `${extra.posizione.x}%`, top: `${extra.posizione.y}%`, width: `${extra.posizione.larghezza}%`, height: `${extra.posizione.altezza}%`,
                        border: attivo ? '2px solid var(--blue)' : '1px dashed rgba(37,99,235,.5)',
                        backgroundImage: `url(${extra.url})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
                        cursor: 'move', boxSizing: 'border-box',
                      }}
                    >
                      {attivo && <ManigliaAngoli colore="var(--blue)" onInizia={(e, angolo) => iniziaTrascinamento(e, id, `ridimensiona-${angolo}`)} />}
                    </div>
                  );
                })}

                {TUTTE_LE_SEZIONI.map((s) => {
                  const p = config.posizioni[s];
                  const attiva = attivoId === s;
                  return (
                    <div
                      key={s}
                      onMouseDown={(e) => iniziaTrascinamento(e, s, 'sposta')}
                      style={{
                        position: 'absolute',
                        left: `${p.x}%`, top: `${p.y}%`, width: `${p.larghezza}%`, height: `${p.altezza}%`,
                        border: attiva ? `2px solid ${config.coloreAccento}` : '1px dashed rgba(0,0,0,.3)',
                        background: attiva ? `${config.coloreAccento}18` : 'rgba(0,0,0,.03)',
                        cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9.5, color: '#333', textAlign: 'center', padding: 2, boxSizing: 'border-box', userSelect: 'none',
                      }}
                    >
                      {ETICHETTE_SEZIONI[s]}
                      {attiva && <ManigliaAngoli colore={config.coloreAccento} onInizia={(e, angolo) => iniziaTrascinamento(e, s, `ridimensiona-${angolo}`)} />}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--mist)', marginTop: 8, textAlign: 'center' }}>
                Clicca un elemento per selezionarlo — trascina il pallino per ridimensionarlo.
              </p>
              {attivoId?.startsWith('extra:') && (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)', width: '100%', marginTop: 6 }} onClick={rimuoviLogoAttivo}>
                  Rimuovi questo logo
                </button>
              )}
            </div>

            <div className="section-card" style={{ flex: 1, minWidth: 260, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
              <div className="campo">
                <label>Nome del layout</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Colore accento</p>
              <div className="campo">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={config.coloreAccento} onChange={(e) => setConfig({ ...config, coloreAccento: e.target.value })} style={{ width: 44, padding: 2 }} />
                  <input value={config.coloreAccento} onChange={(e) => setConfig({ ...config, coloreAccento: e.target.value })} />
                </div>
              </div>

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Colore sfondo</p>
              <div className="campo">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={config.coloreSfondo} onChange={(e) => setConfig({ ...config, coloreSfondo: e.target.value })} style={{ width: 44, padding: 2 }} />
                  <input value={config.coloreSfondo} onChange={(e) => setConfig({ ...config, coloreSfondo: e.target.value })} />
                </div>
              </div>

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Immagine di sfondo</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <CaricaFile etichetta={config.sfondoImmagineUrl ? 'Cambia immagine' : '+ Importa immagine'} onCaricato={(url) => setConfig({ ...config, sfondoImmagineUrl: url })} />
                {config.sfondoImmagineUrl && (
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)' }} onClick={() => setConfig({ ...config, sfondoImmagineUrl: null })}>Rimuovi</button>
                )}
              </div>
              <input
                placeholder="...oppure incolla qui il link di un'immagine"
                value={config.sfondoImmagineUrl ?? ''}
                onChange={(e) => setConfig({ ...config, sfondoImmagineUrl: e.target.value || null })}
                style={{ fontSize: 12.5, marginBottom: 10 }}
              />

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Loghi / immagini aggiuntive</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                <CaricaFile etichetta="+ Aggiungi logo" onCaricato={aggiungiLogo} />
                <span style={{ fontSize: 11.5, color: 'var(--mist)' }}>oppure</span>
                <input
                  placeholder="incolla un link e premi Invio"
                  style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      aggiungiLogo(e.currentTarget.value.trim());
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
              {config.immaginiExtra.length > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 6 }}>
                  {config.immaginiExtra.length} logo{config.immaginiExtra.length === 1 ? '' : ''} sul biglietto — clicca uno sul canvas per spostarlo, ridimensionarlo o rimuoverlo.
                </p>
              )}

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Sfumatura</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
                <input type="checkbox" checked={config.sfumatura.attiva} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, attiva: e.target.checked } })} />
                Attiva sfumatura sopra lo sfondo
              </label>
              {config.sfumatura.attiva && (
                <>
                  <div className="campo">
                    <label>Tipo</label>
                    <select value={config.sfumatura.tipo} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, tipo: e.target.value as Sfumatura['tipo'] } })}>
                      <option value="lineare">Lineare</option>
                      <option value="radiale">Radiale</option>
                    </select>
                  </div>
                  <div className="campo">
                    <label>Colore</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="color" value={config.sfumatura.colore} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, colore: e.target.value } })} style={{ width: 44, padding: 2 }} />
                      <input value={config.sfumatura.colore} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, colore: e.target.value } })} />
                    </div>
                  </div>
                  {config.sfumatura.tipo === 'lineare' ? (
                    <div className="campo">
                      <label>Direzione ({config.sfumatura.direzioneGradi}°)</label>
                      <input type="range" min={0} max={360} value={config.sfumatura.direzioneGradi} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, direzioneGradi: Number(e.target.value) } })} />
                    </div>
                  ) : (
                    <div className="campo">
                      <label>Raggio ({config.sfumatura.raggio}%)</label>
                      <input type="range" min={10} max={150} value={config.sfumatura.raggio} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, raggio: Number(e.target.value) } })} />
                    </div>
                  )}
                  <div className="campo">
                    <label>Intensità ({Math.round(config.sfumatura.opacita * 100)}%)</label>
                    <input type="range" min={0} max={1} step={0.05} value={config.sfumatura.opacita} onChange={(e) => setConfig({ ...config, sfumatura: { ...config.sfumatura, opacita: Number(e.target.value) } })} />
                  </div>
                </>
              )}

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>QR code</p>
              <p style={{ fontSize: 12, color: 'var(--mist)', marginTop: -4 }}>
                Dimensione e posizione si controllano trascinandolo sul canvas, come ogni altro elemento — resta sempre un quadrato (usa il lato più corto, se lo trascini in un rettangolo).
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva'}</button>
                <button className="btn btn-ghost" onClick={anteprima} disabled={generandoAnteprima}>
                  {generandoAnteprima ? 'Genero...' : '📄 Genera anteprima PDF'}
                </button>
                {selezionato && !selezionato.predefinito && (
                  <button className="btn btn-ghost" onClick={impostaPredefinito}>Imposta come predefinito</button>
                )}
                {selezionato && (
                  <button className="btn btn-ghost" style={{ color: 'var(--pink)' }} onClick={elimina} disabled={selezionato.predefinito} title={selezionato.predefinito ? 'Non puoi eliminare il predefinito' : undefined}>
                    Elimina
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
