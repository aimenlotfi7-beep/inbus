import { useEffect, useState } from 'react';
import { whiteLabelApi, type WhiteLabel } from '../../api/whiteLabel';
import { organizzatoriApi, type Organizzatore } from '../../api/organizzatori';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CampoCopiabile } from '../shared/CampoCopiabile';
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
          <WhiteLabelEditor
            whiteLabel={whiteLabelAttiva}
            evento={{ artista: ev.artista, data: ev.data, luogo: ev.luogo, citta: ev.citta, descrizione: ev.descrizione }}
            onSalvato={() => { ricarica(); setVista('lista'); }}
          />
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
