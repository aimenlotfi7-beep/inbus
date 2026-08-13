import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';

export function VetrinaScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  function ricarica() { eventiApi.list().then(setEventi); }
  useEffect(ricarica, []);

  async function toggle(ev: Evento) {
    await eventiApi.update(ev.id, { inEvidenza: !ev.inEvidenza });
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Vetrina" />
      <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 16 }}>
        Scegli quali eventi mostrare nel carosello "Eventi Consigliati" in homepage.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {eventi.map((ev) => (
          <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={ev.inEvidenza} onChange={() => toggle(ev)} style={{ width: 18, height: 18, accentColor: 'var(--pink)' }} />
            <div>
              <b>{ev.artista}</b>
              <div style={{ color: 'var(--mist)', fontSize: 12.5 }}>{ev.luogo}, {ev.citta} · {new Date(ev.data).toLocaleDateString('it-IT')}</div>
            </div>
          </label>
        ))}
        {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento creato ancora.</p>}
      </div>
    </div>
  );
}
