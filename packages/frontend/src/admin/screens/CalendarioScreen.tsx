import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';

export function CalendarioScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  useEffect(() => { eventiApi.list().then(setEventi); }, []);

  const perMese = eventi
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .reduce<Record<string, Evento[]>>((acc, ev) => {
      const chiave = new Date(ev.data).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      (acc[chiave] ??= []).push(ev);
      return acc;
    }, {});

  return (
    <div>
      <PanelHead titolo="Calendario" />
      {Object.entries(perMese).map(([mese, lista]) => (
        <div key={mese} style={{ marginBottom: 22 }}>
          <h3 style={{ fontSize: 14, textTransform: 'capitalize', color: 'var(--mist)', marginBottom: 10 }}>{mese}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map((ev) => (
              <div key={ev.id} style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, width: 40, textAlign: 'center' }}>{new Date(ev.data).getDate()}</div>
                <div>
                  <b>{ev.artista}</b>
                  <div style={{ color: 'var(--mist)', fontSize: 12 }}>{ev.luogo}, {ev.citta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento ancora.</p>}
    </div>
  );
}
