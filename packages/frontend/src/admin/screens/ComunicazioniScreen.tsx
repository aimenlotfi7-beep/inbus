import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { ComunicazioniTab } from './eventi/ComunicazioniTab';

export function ComunicazioniScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [ricerca, setRicerca] = useState('');
  const [eventoScelto, setEventoScelto] = useState<Evento | null>(null);

  useEffect(() => {
    eventiApi.list().then(setEventi).finally(() => setCaricamento(false));
  }, []);

  if (eventoScelto) {
    return (
      <PaginaSezione titolo={`Comunicazioni — ${eventoScelto.artista}`} onIndietro={() => setEventoScelto(null)}>
        <ComunicazioniTab evento={eventoScelto} />
      </PaginaSezione>
    );
  }

  const eventiOrdinati = eventi
    .filter((e) => !ricerca.trim() || `${e.artista} ${e.citta} ${e.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    .sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div>
      <PanelHead titolo="Comunicazioni" />
      <p className="testo-intro" style={{ marginBottom: 16 }}>
        Scegli l'evento per cui vuoi scrivere ai clienti — poi filtri per servizio, tratta o fermata specifica.
      </p>
      <input placeholder="Cerca evento..." value={ricerca} onChange={(e) => setRicerca(e.target.value)} style={{ marginBottom: 16, maxWidth: 360 }} />

      {caricamento && <p className="testo-intro">Carico...</p>}
      {!caricamento && eventiOrdinati.length === 0 && <p className="testo-intro">Nessun evento trovato.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {eventiOrdinati.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => setEventoScelto(ev)}
            className="section-card"
            style={{ textAlign: 'left', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', width: '100%' }}
          >
            <span>
              <b>{ev.artista}</b> — {ev.luogo}, {ev.citta}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--mist)' }}>{new Date(ev.data).toLocaleDateString('it-IT')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
