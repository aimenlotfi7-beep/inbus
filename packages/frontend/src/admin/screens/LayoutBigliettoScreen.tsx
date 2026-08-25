import { useEffect, useState } from 'react';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../api/layoutBiglietto';
import { PanelHead } from '../shared/PanelHead';

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

interface Configurazione {
  coloreAccento: string;
  ordineElementi: SezioneBiglietto[];
  qr: { dimensione: number; allineamento: 'sinistra' | 'centro' | 'destra' };
  spaziaturaSezioni: number;
}
const CONFIG_DEFAULT: Configurazione = {
  coloreAccento: '#111111',
  ordineElementi: TUTTE_LE_SEZIONI,
  qr: { dimensione: 140, allineamento: 'centro' },
  spaziaturaSezioni: 1,
};

function analizzaConfigurazione(testo: string): Configurazione {
  try {
    const c = JSON.parse(testo);
    return {
      coloreAccento: typeof c.coloreAccento === 'string' ? c.coloreAccento : CONFIG_DEFAULT.coloreAccento,
      ordineElementi: Array.isArray(c.ordineElementi) ? c.ordineElementi.filter((e: string) => TUTTE_LE_SEZIONI.includes(e as SezioneBiglietto)) : CONFIG_DEFAULT.ordineElementi,
      qr: {
        dimensione: typeof c.qr?.dimensione === 'number' ? c.qr.dimensione : CONFIG_DEFAULT.qr.dimensione,
        allineamento: ['sinistra', 'centro', 'destra'].includes(c.qr?.allineamento) ? c.qr.allineamento : CONFIG_DEFAULT.qr.allineamento,
      },
      spaziaturaSezioni: typeof c.spaziaturaSezioni === 'number' ? c.spaziaturaSezioni : CONFIG_DEFAULT.spaziaturaSezioni,
    };
  } catch {
    return CONFIG_DEFAULT;
  }
}

/** Editor del layout del biglietto digitale PDF — pannello strutturato
 *  (colore, ordine sezioni, QR, spaziatura), stesso principio
 *  dell'editor White Label: si sceglie con controlli veri, non
 *  scrivendo JSON a mano. La vera anteprima resta il PDF generato al
 *  volo (un PDF non si può "vedere dal vivo" come l'HTML della White
 *  Label senza duplicare il motore di generazione). */
export function LayoutBigliettoScreen() {
  const [lista, setLista] = useState<LayoutBiglietto[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [selezionato, setSelezionato] = useState<LayoutBiglietto | null>(null);
  const [nome, setNome] = useState('');
  const [config, setConfig] = useState<Configurazione>(CONFIG_DEFAULT);
  const [salvando, setSalvando] = useState(false);
  const [generandoAnteprima, setGenerandoAnteprima] = useState(false);

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
  }

  function nuovo() {
    setSelezionato(null);
    setNome('Nuovo layout');
    setConfig(CONFIG_DEFAULT);
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

  function spostaSezione(indice: number, direzione: -1 | 1) {
    const nuovoIndice = indice + direzione;
    if (nuovoIndice < 0 || nuovoIndice >= config.ordineElementi.length) return;
    const copia = [...config.ordineElementi];
    [copia[indice], copia[nuovoIndice]] = [copia[nuovoIndice], copia[indice]];
    setConfig({ ...config, ordineElementi: copia });
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  return (
    <div>
      <PanelHead titolo="Layout biglietto" azione={<button type="button" className="btn btn-primary" onClick={nuovo}>+ Nuovo layout</button>} />
      <p className="testo-intro" style={{ marginBottom: 16 }}>
        Componi la grafica del biglietto digitale (PDF) con i controlli qui sotto. Ogni evento usa il layout{' '}
        <b>predefinito</b> a meno che, dalla sua scheda, tu non ne scelga uno diverso.
      </p>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => apri(l)}
              className="riga-cliccabile"
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, flex: 1, minWidth: 320, alignItems: 'start' }}>
          <div className="section-card">
            <div className="campo">
              <label>Nome del layout</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Colore</p>
            <div className="campo">
              <label>Colore accento</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="color" value={config.coloreAccento} onChange={(e) => setConfig({ ...config, coloreAccento: e.target.value })} style={{ width: 44, padding: 2 }} />
                <input value={config.coloreAccento} onChange={(e) => setConfig({ ...config, coloreAccento: e.target.value })} />
              </div>
            </div>

            <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Ordine delle sezioni</p>
            <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 8 }}>Usa le frecce per riordinare — l'ordine qui è l'ordine in cui compaiono sul biglietto.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {config.ordineElementi.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 13 }}>{ETICHETTE_SEZIONI[s]}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => spostaSezione(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => spostaSezione(i, 1)} disabled={i === config.ordineElementi.length - 1}>↓</button>
                  </div>
                </div>
              ))}
            </div>

            <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>QR code</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div className="campo">
                <label>Dimensione (px)</label>
                <input type="number" min={60} max={280} value={config.qr.dimensione} onChange={(e) => setConfig({ ...config, qr: { ...config.qr, dimensione: Number(e.target.value) || 140 } })} />
              </div>
              <div className="campo">
                <label>Allineamento</label>
                <select value={config.qr.allineamento} onChange={(e) => setConfig({ ...config, qr: { ...config.qr, allineamento: e.target.value as Configurazione['qr']['allineamento'] } })}>
                  <option value="sinistra">Sinistra</option>
                  <option value="centro">Centro</option>
                  <option value="destra">Destra</option>
                </select>
              </div>
            </div>

            <p className="section-label" style={{ marginTop: 18, marginBottom: 10 }}>Spaziatura</p>
            <div className="campo" style={{ marginBottom: 18 }}>
              <label>Spazio tra le sezioni (1 = normale)</label>
              <input type="number" min={0.5} max={3} step={0.1} value={config.spaziaturaSezioni} onChange={(e) => setConfig({ ...config, spaziaturaSezioni: Number(e.target.value) || 1 })} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

          {/* Non è il vero PDF (per quello c'è "Genera anteprima PDF"
              qui accanto) — è solo uno schema per vedere subito ordine
              e colore mentre li cambi, senza dover scaricare un file
              ogni volta. */}
          <div style={{ position: 'sticky', top: 20 }}>
            <p style={{ fontSize: 11, color: 'var(--mist)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>Schema (non il PDF vero)</p>
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: `${config.spaziaturaSezioni * 10}px` }}>
              <div style={{ height: 4, background: config.coloreAccento, borderRadius: 2, marginBottom: 4 }} />
              {config.ordineElementi.map((s) =>
                s === 'qr' ? (
                  <div key={s} style={{ display: 'flex', justifyContent: config.qr.allineamento === 'sinistra' ? 'flex-start' : config.qr.allineamento === 'destra' ? 'flex-end' : 'center' }}>
                    <div style={{ width: Math.min(config.qr.dimensione, 90), height: Math.min(config.qr.dimensione, 90), background: '#eee', border: `1px solid ${config.coloreAccento}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--mist)' }}>
                      QR
                    </div>
                  </div>
                ) : (
                  <div key={s} style={{ padding: '6px 8px', background: 'var(--night)', borderLeft: `3px solid ${config.coloreAccento}`, borderRadius: 3, fontSize: 11, color: '#333' }}>
                    {ETICHETTE_SEZIONI[s]}
                  </div>
                )
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
