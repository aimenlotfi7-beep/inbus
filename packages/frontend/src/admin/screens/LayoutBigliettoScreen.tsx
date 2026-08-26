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
interface Configurazione {
  coloreAccento: string;
  posizioni: Record<SezioneBiglietto, Posizione>;
  qr: { dimensione: number };
  sfondoImmagineUrl: string | null;
  sfondoOpacita: number;
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
  posizioni: POSIZIONI_DEFAULT,
  qr: { dimensione: 33 },
  sfondoImmagineUrl: null,
  sfondoOpacita: 1,
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
      posizioni,
      qr: { dimensione: typeof c.qr?.dimensione === 'number' ? c.qr.dimensione : CONFIG_DEFAULT.qr.dimensione },
      sfondoImmagineUrl: typeof c.sfondoImmagineUrl === 'string' ? c.sfondoImmagineUrl : null,
      sfondoOpacita: typeof c.sfondoOpacita === 'number' ? c.sfondoOpacita : 1,
      spaziaturaSezioni: typeof c.spaziaturaSezioni === 'number' ? c.spaziaturaSezioni : 1,
    };
  } catch {
    return CONFIG_DEFAULT;
  }
}

const RAPPORTO_A5 = 420 / 595;
const LARGHEZZA_CANVAS = 380;
const ALTEZZA_CANVAS = LARGHEZZA_CANVAS / RAPPORTO_A5;

export function LayoutBigliettoScreen() {
  const [lista, setLista] = useState<LayoutBiglietto[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [selezionato, setSelezionato] = useState<LayoutBiglietto | null>(null);
  const [nome, setNome] = useState('');
  const [config, setConfig] = useState<Configurazione>(CONFIG_DEFAULT);
  const [salvando, setSalvando] = useState(false);
  const [generandoAnteprima, setGenerandoAnteprima] = useState(false);
  const [sezioneAttiva, setSezioneAttiva] = useState<SezioneBiglietto | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const trascinamento = useRef<{ sezione: SezioneBiglietto; modo: 'sposta' | 'ridimensiona'; inizioMouseX: number; inizioMouseY: number; posizioneIniziale: Posizione } | null>(null);

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
    setSezioneAttiva(null);
  }
  function nuovo() {
    setSelezionato(null);
    setNome('Nuovo layout');
    setConfig(CONFIG_DEFAULT);
    setSezioneAttiva(null);
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

  function aggiornaPosizione(sezione: SezioneBiglietto, nuova: Partial<Posizione>) {
    setConfig((c) => ({ ...c, posizioni: { ...c.posizioni, [sezione]: { ...c.posizioni[sezione], ...nuova } } }));
  }

  function iniziaTrascinamento(e: React.MouseEvent, sezione: SezioneBiglietto, modo: 'sposta' | 'ridimensiona') {
    e.preventDefault();
    e.stopPropagation();
    setSezioneAttiva(sezione);
    trascinamento.current = { sezione, modo, inizioMouseX: e.clientX, inizioMouseY: e.clientY, posizioneIniziale: { ...config.posizioni[sezione] } };
    window.addEventListener('mousemove', duranteTrascinamento);
    window.addEventListener('mouseup', fineTrascinamento);
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
      aggiornaPosizione(t.sezione, { x: nuovaX, y: nuovaY });
    } else {
      const nuovaLarghezza = Math.max(6, Math.min(100 - t.posizioneIniziale.x, t.posizioneIniziale.larghezza + deltaXPercento));
      const nuovaAltezza = Math.max(4, Math.min(100 - t.posizioneIniziale.y, t.posizioneIniziale.altezza + deltaYPercento));
      aggiornaPosizione(t.sezione, { larghezza: nuovaLarghezza, altezza: nuovaAltezza });
    }
  }
  function fineTrascinamento() {
    trascinamento.current = null;
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
        Trascina ogni sezione dove vuoi sul biglietto; trascina l'angolo in basso a destra per ridimensionarla. Ogni evento usa il layout <b>predefinito</b> a meno che, dalla sua scheda, tu non ne scelga uno diverso.
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
            <div style={{ flex: '0 0 auto' }}>
              <div
                ref={canvasRef}
                onMouseDown={() => setSezioneAttiva(null)}
                style={{
                  position: 'relative', width: LARGHEZZA_CANVAS, height: ALTEZZA_CANVAS,
                  background: config.sfondoImmagineUrl ? `url(${config.sfondoImmagineUrl}) center/cover` : '#fff',
                  border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 10px 30px -10px rgba(0,0,0,.4)',
                }}
              >
                {config.sfondoImmagineUrl && config.sfondoOpacita < 1 && (
                  <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 1 - config.sfondoOpacita }} />
                )}
                {TUTTE_LE_SEZIONI.map((s) => {
                  const p = config.posizioni[s];
                  const attiva = sezioneAttiva === s;
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
                      {attiva && (
                        <div
                          onMouseDown={(e) => iniziaTrascinamento(e, s, 'ridimensiona')}
                          style={{
                            position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, borderRadius: '50%',
                            background: config.coloreAccento, border: '2px solid #fff', cursor: 'nwse-resize',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--mist)', marginTop: 8, textAlign: 'center' }}>
                Clicca una sezione per selezionarla — trascina il pallino per ridimensionarla.
              </p>
            </div>

            <div className="section-card" style={{ flex: 1, minWidth: 260 }}>
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

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Sfondo del biglietto</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <CaricaFile etichetta={config.sfondoImmagineUrl ? 'Cambia immagine' : '+ Importa immagine'} onCaricato={(url) => setConfig({ ...config, sfondoImmagineUrl: url })} />
                {config.sfondoImmagineUrl && (
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)' }} onClick={() => setConfig({ ...config, sfondoImmagineUrl: null })}>Rimuovi</button>
                )}
              </div>
              {config.sfondoImmagineUrl && (
                <div className="campo">
                  <label>Sfumatura sfondo ({Math.round(config.sfondoOpacita * 100)}% visibile)</label>
                  <input type="range" min={0} max={1} step={0.05} value={config.sfondoOpacita} onChange={(e) => setConfig({ ...config, sfondoOpacita: Number(e.target.value) })} />
                </div>
              )}

              <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>QR code</p>
              <div className="campo">
                <label>Dimensione (% larghezza pagina)</label>
                <input type="number" min={10} max={70} value={config.qr.dimensione} onChange={(e) => setConfig({ ...config, qr: { dimensione: Number(e.target.value) || 33 } })} />
              </div>

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
