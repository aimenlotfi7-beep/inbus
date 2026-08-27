import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';

export function VetrinaScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [ricerca, setRicerca] = useState('');
  function ricarica() { eventiApi.list().then(setEventi); }
  useEffect(ricarica, []);

  const eventiFiltrati = ricerca.trim()
    ? eventi.filter((ev) => `${ev.artista} ${ev.citta}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventi;

  async function toggle(ev: Evento) {
    await eventiApi.update(ev.id, { inEvidenza: !ev.inEvidenza });
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Vetrina" />
      <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 16 }}>
        Scegli quali eventi mostrare nel carosello "Eventi Consigliati" in homepage — clicca una card per attivarla/disattivarla.
      </p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista o città..." />
      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => toggle(ev)}
            selezionato={ev.inEvidenza}
            badge={ev.inEvidenza ? '✓ In vetrina' : undefined}
          />
        ))}
        {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento creato ancora.</p>}
      </div>
    </div>
  );
}
