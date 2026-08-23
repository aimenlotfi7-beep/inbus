import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';

const ETICHETTA_STATO: Record<string, string> = {
  POCHI_POSTI: '🟡 Pochi posti',
  NUOVI_POSTI: '🟢 Nuovi posti',
  ESAURITO: '🔴 Esaurito',
};

export function CalendarioScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [statistiche, setStatistiche] = useState<Record<string, { partecipanti: number; busCensiti: number }>>({});
  const [allerte, setAllerte] = useState<Record<string, number>>({});

  useEffect(() => {
    eventiApi.list().then(setEventi);
    eventiApi.statistichePerEvento().then(setStatistiche).catch(() => {});
    eventiApi.allertePartenzePerEvento().then(setAllerte).catch(() => {});
  }, []);

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
            {lista.map((ev) => {
              const stat = statistiche[ev.id];
              const giorniAllaPartenza = Math.ceil((new Date(ev.data).getTime() - Date.now()) / (24 * 3600 * 1000));
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, width: 40, textAlign: 'center', flexShrink: 0 }}>{new Date(ev.data).getDate()}</div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <b>{ev.artista}</b>
                    {allerte[ev.id] > 0 && <span className="badge non-coperta" style={{ marginLeft: 8 }} title="Tratte con posti superati">⚠ {allerte[ev.id]}</span>}
                    <div style={{ color: 'var(--mist)', fontSize: 12 }}>
                      {ev.luogo}, {ev.citta}
                      {giorniAllaPartenza >= 0 && ` · tra ${giorniAllaPartenza} giorni`}
                      {ev.statoDisponibilita && <> · {ETICHETTA_STATO[ev.statoDisponibilita]}</>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={`/eventi/${ev.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', textDecoration: 'none' }}>
                      🔗 Link sito
                    </a>
                    <span className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', cursor: 'default' }}>
                      👥 {stat?.partecipanti ?? 0} partecipanti
                    </span>
                    <span className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', cursor: 'default' }}>
                      🚌 {stat?.busCensiti ?? 0} bus censiti
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento ancora.</p>}
    </div>
  );
}
