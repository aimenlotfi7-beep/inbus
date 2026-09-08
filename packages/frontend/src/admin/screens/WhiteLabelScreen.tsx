import { useEffect, useState } from 'react';
import { bundleApi, type BundleRiga } from '../../api/bundle';
import { whiteLabelApi, type WhiteLabel } from '../../api/whiteLabel';
import { organizzatoriApi, type Organizzatore } from '../../api/organizzatori';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { ErroreApi } from '../../api/client';
import { notifica } from '../shared/notifiche';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';
import { CampoCopiabile } from '../shared/CampoCopiabile';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../api/layoutBiglietto';
import { WhiteLabelEditor } from '../../features/white-label/WhiteLabelEditor';

/** EVENTO -> ORGANIZZATORI -> White Label, come richiesto — qui si
 *  parte scegliendo organizzatore ed evento (tra quelli già
 *  associati, Tappa 1), si crea la White Label, e si passa
 *  all'editor grafico + codice embed. */
export function WhiteLabelScreen() {
  const mappaTooltip = useMappaTooltip();
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
      <PaginaSezione titolo={`White Label — ${whiteLabelAttiva.organizzatoreNome} · ${whiteLabelAttiva.bundleNome ? `${whiteLabelAttiva.bundleNome} (bundle)` : whiteLabelAttiva.eventoArtista}`} onIndietro={() => { ricarica(); setVista('lista'); }}>
        <div style={{ maxWidth: 480, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CampoCopiabile etichetta="Link diretto" valore={`${window.location.origin}/w/${whiteLabelAttiva.publicWidgetId}`} link />
          <CampoCopiabile
            etichetta="Codice embed"
            valore={`<div id="inbus-widget"></div>\n<script src="${window.location.origin}/embed.js" data-inbus-widget="${whiteLabelAttiva.publicWidgetId}"></script>`}
          />
        </div>
        {ev && (
          <>
            <SelettoreLayoutBiglietto whiteLabel={whiteLabelAttiva} onSalvato={(wl) => setWhiteLabelAttiva(wl)} />
            <MetaPixelOrganizzatore whiteLabel={whiteLabelAttiva} onSalvato={(wl) => setWhiteLabelAttiva(wl)} />
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
      <PanelHead titolo="White Label" azione={<button className="btn btn-primary" onClick={() => setVista('nuova')}>+ Nuova White Label</button>} info={mappaTooltip.white_label_intro ?? TOOLTIP_DEFAULT.white_label_intro} />
      {whiteLabels.length === 0 && <p style={{ color: 'var(--mist)' }}>Nessuna White Label creata ancora.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {whiteLabels.map((wl) => (
          <div key={wl.id} className="section-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <div>
              <b>{wl.organizzatoreNome}</b> — {wl.bundleNome ? `${wl.bundleNome} (bundle)` : wl.eventoArtista}
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
  const [bundleOrganizzatore, setBundleOrganizzatore] = useState<BundleRiga[]>([]);
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    if (!organizzatoreId) { setEventiOrganizzatore([]); return; }
    const org = organizzatori.find((o) => o.id === organizzatoreId);
    if (!org) return;
    eventiApi.list().then((tutti) => setEventiOrganizzatore(tutti.filter((e) => org.eventiAbilitati.includes(e.id))));
    // I bundle associati a questo organizzatore (scheda Bundle → Vendita).
    bundleApi.list().then((tutti) => setBundleOrganizzatore(tutti.filter((b) => b.organizzatoreId === organizzatoreId))).catch(() => setBundleOrganizzatore([]));
  }, [organizzatoreId, organizzatori]);

  async function crea() {
    if (!organizzatoreId || !eventoId) return;
    setCaricamento(true);
    setErrore('');
    try {
      const nuova = await whiteLabelApi.create(eventoId.startsWith('bundle:') ? { organizzatoreId, bundleId: eventoId.slice(7) } : { organizzatoreId, eventoId });
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
          <label>Evento o bundle</label>
          <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
            <option value="">Scegli...</option>
            {eventiOrganizzatore.length > 0 && <optgroup label="Eventi">{eventiOrganizzatore.map((e) => <option key={e.id} value={e.id}>{e.artista}</option>)}</optgroup>}
            {bundleOrganizzatore.length > 0 && <optgroup label="Bundle">{bundleOrganizzatore.map((b) => <option key={b.id} value={`bundle:${b.id}`}>{b.nome} (bundle)</option>)}</optgroup>}
          </select>
          {eventiOrganizzatore.length === 0 && bundleOrganizzatore.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--mist)', marginTop: 6 }}>Questo organizzatore non ha ancora nessun evento associato (Organizzatori) né bundle associato (Bundle → Vendita → organizzatore).</p>
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
/** Il pixel di Meta DI QUESTO organizzatore (facoltativo) — le sue
 *  vendite dal widget mandano l'evento SIA al pixel di INBUS (sempre)
 *  SIA a questo, se lo imposta: due ad account, la stessa vendita.
 *  Stesso schema di SelettoreLayoutBiglietto qui sopra: salvataggio
 *  immediato al blur, non un form a parte. */
function MetaPixelOrganizzatore({ whiteLabel, onSalvato }: { whiteLabel: WhiteLabel; onSalvato: (wl: WhiteLabel) => void }) {
  const [pixelId, setPixelId] = useState(whiteLabel.metaPixelId ?? '');
  const [token, setToken] = useState(whiteLabel.metaCapiToken ?? '');
  const [salvando, setSalvando] = useState(false);

  async function salva() {
    setSalvando(true);
    try {
      const aggiornata = await whiteLabelApi.update(whiteLabel.id, { metaPixelId: pixelId || null, metaCapiToken: token || null });
      onSalvato(aggiornata);
      notifica('Pixel dell\'organizzatore salvato.', 'successo');
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Salvataggio non riuscito.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="section-card" style={{ maxWidth: 480, marginBottom: 20 }}>
      <p className="section-label" style={{ marginBottom: 8 }}>Pixel di Meta dell'organizzatore (facoltativo)</p>
      <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 10 }}>
        Se questo organizzatore ha un suo account pubblicitario Meta, le vendite dal suo widget arriveranno anche al suo pixel — oltre che al nostro, sempre.
      </p>
      <div className="campo" style={{ marginBottom: 8 }}>
        <label>ID Pixel</label>
        <input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="(non impostato)" />
      </div>
      <div className="campo" style={{ marginBottom: 10 }}>
        <label>Token Conversions API</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="(non impostato)" />
      </div>
      <button className="btn btn-ghost" onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva'}</button>
    </div>
  );
}

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
