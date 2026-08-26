import { useEffect, useState } from 'react';
import { whiteLabelApi, type WhiteLabel } from '../../api/whiteLabel';
import { organizzatoriApi, type Organizzatore } from '../../api/organizzatori';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CampoCopiabile } from '../shared/CampoCopiabile';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../api/layoutBiglietto';
import { WhiteLabelEditor } from '../../features/white-label/WhiteLabelEditor';

/** EVENTO -> ORGANIZZATORI -> White Label, come richiesto — qui si
 *  parte scegliendo organizzatore ed evento (tra quelli già
 *  associati, Tappa 1), si crea la White Label, e si passa
 *  all'editor grafico + codice embed. */
export function WhiteLabelScreen() {
  const [whiteLabels, setWhiteLabels] = useState<WhiteLabel[]>([]);
  const [organizzatori, setOrganizzatori] = useState<Organizzatore[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [vista, setVista] = useState<'lista' | 'nuova' | 'editor'>('lista');
  const [whiteLabelAttiva, setWhiteLabelAttiva] = useState<WhiteLabel | null>(null);

  function ricarica() {
    whiteLabelApi.list().then(setWhiteLabels);
    organizzatoriApi.list().then(setOrganizzatori);
    eventiApi.list().then(setEventi);
  }
  useEffect(ricarica, []);

  if (vista === 'nuova') {
    return <NuovaWhiteLabel organizzatori={organizzatori} onIndietro={() => setVista('lista')} onCreata={(wl) => { ricarica(); setWhiteLabelAttiva(wl); setVista('editor'); }} />;
  }

  if (vista === 'editor' && whiteLabelAttiva) {
    const ev = eventi.find((e) => e.id === whiteLabelAttiva.eventoId);
    return (
      <PaginaSezione titolo={`White Label — ${whiteLabelAttiva.organizzatoreNome} · ${whiteLabelAttiva.eventoArtista}`} onIndietro={() => { ricarica(); setVista('lista'); }}>
        <div style={{ maxWidth: 480, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CampoCopiabile etichetta="Link diretto" valore={`${window.location.origin}/w/${whiteLabelAttiva.publicWidgetId}`} />
          <CampoCopiabile
            etichetta="Codice embed"
            valore={`<div id="inbus-widget"></div>\n<script src="${window.location.origin}/embed.js" data-inbus-widget="${whiteLabelAttiva.publicWidgetId}"></script>`}
          />
        </div>
        {ev && (
          <>
            <SelettoreLayoutBiglietto whiteLabel={whiteLabelAttiva} onSalvato={(wl) => setWhiteLabelAttiva(wl)} />
            <WhiteLabelEditor
              whiteLabel={whiteLabelAttiva}
              evento={{ artista: ev.artista, data: ev.data, luogo: ev.luogo, citta: ev.citta, descrizione: ev.descrizione }}
              onSalvato={() => { ricarica(); setVista('lista'); }}
            />
          </>
        )}
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="White Label" azione={<button className="btn btn-primary" onClick={() => setVista('nuova')}>+ Nuova White Label</button>} />
      <p className="testo-intro" style={{ marginBottom: 18 }}>
        Ogni riga collega un organizzatore a UN suo evento specifico — il widget che riceve serve solo a vendere il viaggio di quell'evento, mai altro.
      </p>
      {whiteLabels.length === 0 && <p style={{ color: 'var(--mist)' }}>Nessuna White Label creata ancora.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {whiteLabels.map((wl) => (
          <div key={wl.id} className="section-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <div>
              <b>{wl.organizzatoreNome}</b> — {wl.eventoArtista}
              <span style={{ marginLeft: 10, fontSize: 11.5, color: wl.attiva ? '#5be0a0' : 'var(--mist)' }}>{wl.attiva ? '● Attiva' : '○ Disattivata'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setWhiteLabelAttiva(wl); setVista('editor'); }}>Modifica</button>
              <ToggleAttiva whiteLabel={wl} onCambiata={ricarica} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleAttiva({ whiteLabel, onCambiata }: { whiteLabel: WhiteLabel; onCambiata: () => void }) {
  async function toggle() {
    await whiteLabelApi.update(whiteLabel.id, { attiva: !whiteLabel.attiva });
    onCambiata();
  }
  return (
    <button className="btn btn-ghost" onClick={toggle}>{whiteLabel.attiva ? 'Disattiva' : 'Attiva'}</button>
  );
}

function NuovaWhiteLabel({ organizzatori, onIndietro, onCreata }: { organizzatori: Organizzatore[]; onIndietro: () => void; onCreata: (wl: WhiteLabel) => void }) {
  const [organizzatoreId, setOrganizzatoreId] = useState('');
  const [eventoId, setEventoId] = useState('');
  const [eventiOrganizzatore, setEventiOrganizzatore] = useState<Evento[]>([]);
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    if (!organizzatoreId) { setEventiOrganizzatore([]); return; }
    const org = organizzatori.find((o) => o.id === organizzatoreId);
    if (!org) return;
    eventiApi.list().then((tutti) => setEventiOrganizzatore(tutti.filter((e) => org.eventiAbilitati.includes(e.id))));
  }, [organizzatoreId, organizzatori]);

  async function crea() {
    if (!organizzatoreId || !eventoId) return;
    setCaricamento(true);
    setErrore('');
    try {
      const nuova = await whiteLabelApi.create({ organizzatoreId, eventoId });
      onCreata(nuova);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Creazione non riuscita.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <PaginaSezione titolo="Nuova White Label" onIndietro={onIndietro}>
      <div className="campo">
        <label>Organizzatore</label>
        <select value={organizzatoreId} onChange={(e) => { setOrganizzatoreId(e.target.value); setEventoId(''); }}>
          <option value="">Scegli...</option>
          {organizzatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>
      {organizzatoreId && (
        <div className="campo">
          <label>Evento</label>
          <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
            <option value="">Scegli...</option>
            {eventiOrganizzatore.map((e) => <option key={e.id} value={e.id}>{e.artista}</option>)}
          </select>
          {eventiOrganizzatore.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--mist)', marginTop: 6 }}>Questo organizzatore non ha ancora nessun evento associato — vai in "Organizzatori" per associarglielo prima.</p>
          )}
        </div>
      )}
      {errore && <p style={{ color: 'var(--pink)', fontSize: 13 }}>{errore}</p>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={crea} disabled={!organizzatoreId || !eventoId || caricamento}>
        {caricamento ? 'Creazione...' : 'Crea White Label'}
      </button>
    </PaginaSezione>
  );
}

/** Il layout del BIGLIETTO (PDF) — cosa riceve davvero il cliente via
 *  email/download, con i suoi loghi sponsor. Volutamente separato e
 *  ben etichettato rispetto al "tema" del widget qui sotto (quello è
 *  l'aspetto della pagina/vetrina online, questo è il documento vero)
 *  — per non far confondere all'amministratore i due layout diversi.
 *  Nessuna scelta = usa il layout dell'evento, come è sempre stato. */
function SelettoreLayoutBiglietto({ whiteLabel, onSalvato }: { whiteLabel: WhiteLabel; onSalvato: (wl: WhiteLabel) => void }) {
  const [layout, setLayout] = useState<LayoutBiglietto[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { layoutBigliettoApi.list().then(setLayout); }, []);

  async function cambia(id: string) {
    setSalvando(true);
    try {
      const aggiornata = await whiteLabelApi.update(whiteLabel.id, { layoutBigliettoId: id || null });
      onSalvato(aggiornata);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="section-card" style={{ maxWidth: 480, marginBottom: 20 }}>
      <p className="section-label" style={{ marginBottom: 8 }}>Layout biglietto (PDF) di questa White Label</p>
      <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 10 }}>
        Diverso dal tema qui sotto — questo è il vero documento che il cliente riceve. Se non scegli nulla, usa il layout impostato per l'evento.
      </p>
      <select value={whiteLabel.layoutBigliettoId ?? ''} onChange={(e) => cambia(e.target.value)} disabled={salvando}>
        <option value="">— Usa il layout dell'evento —</option>
        {layout.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.predefinito ? ' (predefinito)' : ''}</option>)}
      </select>
    </div>
  );
}
