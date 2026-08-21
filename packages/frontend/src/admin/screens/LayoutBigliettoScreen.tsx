import { useEffect, useRef, useState } from 'react';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../api/layoutBiglietto';
import { PanelHead } from '../shared/PanelHead';

const SEZIONI_DISPONIBILI = ['intestazione_immagine', 'titolo', 'evento', 'partenza', 'passeggero', 'pnr', 'qr', 'nota'];

const CONFIG_ESEMPIO = JSON.stringify({
  coloreAccento: '#111111',
  ordineElementi: ['intestazione_immagine', 'titolo', 'evento', 'partenza', 'passeggero', 'pnr', 'qr', 'nota'],
  qr: { dimensione: 140, allineamento: 'centro' },
  spaziaturaSezioni: 1,
}, null, 2);

/** Editor del layout (composizione grafica) del biglietto digitale PDF —
 *  a codice/JSON, come richiesto: si scrive/modifica direttamente la
 *  configurazione, con un pulsante che genera subito un PDF di prova con
 *  dati finti per vedere il risultato prima di salvare. Ogni evento usa
 *  il layout "predefinito" a meno che non ne scelga uno diverso dalla
 *  sua scheda. */
export function LayoutBigliettoScreen() {
  const [lista, setLista] = useState<LayoutBiglietto[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [selezionato, setSelezionato] = useState<LayoutBiglietto | null>(null);
  const [nome, setNome] = useState('');
  const [configurazione, setConfigurazione] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [generandoAnteprima, setGenerandoAnteprima] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

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
    setConfigurazione(l.configurazione);
  }

  function nuovo() {
    setSelezionato(null);
    setNome('Nuovo layout');
    setConfigurazione(CONFIG_ESEMPIO);
  }

  async function salva() {
    if (!nome.trim() || !configurazione.trim()) { alert('Nome e configurazione non possono essere vuoti.'); return; }
    setSalvando(true);
    try {
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
      await layoutBigliettoApi.scaricaAnteprima(configurazione);
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

  function inserisciSezione(s: string) {
    const area = areaRef.current;
    if (!area) return;
    const inizio = area.selectionStart;
    const fine = area.selectionEnd;
    const nuovoTesto = configurazione.slice(0, inizio) + `"${s}"` + configurazione.slice(fine);
    setConfigurazione(nuovoTesto);
    setTimeout(() => { area.focus(); area.selectionStart = area.selectionEnd = inizio + s.length + 2; }, 0);
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  return (
    <div>
      <PanelHead titolo="Layout biglietto" azione={<button type="button" className="btn btn-primary" onClick={nuovo}>+ Nuovo layout</button>} />
      <p className="testo-intro" style={{ marginBottom: 16 }}>
        Componi la grafica del biglietto digitale (PDF) modificando direttamente la configurazione — riordina le
        sezioni, sposta/ridimensiona il QR, cambia i colori. Ogni evento usa il layout <b>predefinito</b> a meno
        che, dalla sua scheda, tu non ne scelga uno diverso.
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
          <div className="section-card" style={{ flex: 1, minWidth: 320 }}>
            <div className="campo">
              <label>Nome del layout</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <p className="testo-intro" style={{ fontSize: 11.5, marginBottom: 8 }}>
              Sezioni disponibili per "ordineElementi" (clicca per inserirla nel testo):{' '}
              {SEZIONI_DISPONIBILI.map((s) => (
                <button key={s} type="button" onClick={() => inserisciSezione(s)} className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginRight: 4, marginBottom: 4 }}>
                  {s}
                </button>
              ))}
            </p>

            <div className="campo">
              <label>Configurazione (JSON)</label>
              <textarea
                ref={areaRef}
                value={configurazione}
                onChange={(e) => setConfigurazione(e.target.value)}
                rows={14}
                style={{ fontFamily: "'Space Mono',monospace", fontSize: 12.5 }}
              />
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
        )}
      </div>
    </div>
  );
}
