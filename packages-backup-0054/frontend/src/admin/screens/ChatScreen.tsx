import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { chatApi, type MessaggioChat } from '../../api/chat';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';

export function ChatScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [testo, setTesto] = useState('');

  useEffect(() => { eventiApi.list().then((e) => { setEventi(e); if (e[0]) setEventoId(e[0].id); }); }, []);
  useEffect(() => { if (eventoId) chatApi.perEvento(eventoId).then(setMessaggi); }, [eventoId]);

  async function invia() {
    if (!testo.trim() || !eventoId) return;
    await chatApi.invia({ eventoId, nome: 'Staff INBUS', testo });
    setTesto('');
    chatApi.perEvento(eventoId).then(setMessaggi);
  }

  return (
    <div>
      <PanelHead titolo="Chat" />
      <div className="campo" style={{ maxWidth: 360 }}>
        <label>Evento</label>
        <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
          {eventi.map((ev) => <option key={ev.id} value={ev.id}>{ev.artista} — {ev.citta}</option>)}
        </select>
      </div>

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, marginTop: 16, display: 'flex', flexDirection: 'column', height: '55vh' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!messaggi.length && <p style={{ color: 'var(--mist)' }}>Nessun messaggio per questo evento.</p>}
          {messaggi.map((m) => (
            <div key={m.id} style={{
              maxWidth: '75%', padding: '9px 13px', borderRadius: 12, fontSize: 13.5,
              alignSelf: m.autore === 'ADMIN' ? 'flex-end' : 'flex-start',
              background: m.autore === 'ADMIN' ? 'var(--pink)' : 'var(--night)',
              color: m.autore === 'ADMIN' ? '#fff' : 'var(--paper)',
            }}>
              {m.testo}
              <div style={{ fontSize: 10, opacity: .7, marginTop: 4 }}>{m.nome} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
          <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi una risposta..."
            onKeyDown={(e) => e.key === 'Enter' && invia()}
            style={{ flex: 1, background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--paper)' }} />
          <button className="btn btn-primary" onClick={invia}>Invia</button>
        </div>
      </div>
    </div>
  );
}
