import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

/**
 * Elenco eventi pensato per arrivare rapidamente alla gestione delle
 * partenze: click su un evento → si apre la sua scheda già sulla tab
 * "Partenze" (niente selettore/tendina, solo la lista da cui scegliere).
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [selezionato, setSelezionato] = useState<Evento | null>(null);

  function ricarica() {
    eventiApi.list().then(setEventi);
  }
  useEffect(ricarica, []);

  return (
    <div>
      <PanelHead titolo="Partenze" />
      <p className="testo-intro">Scegli un evento per vedere il calcolo bus, la copertura delle tratte e i bus censiti.</p>

      <div className="cards-list">
        {eventi.map((ev) => (
          <div key={ev.id} className="evento-card" onClick={() => setSelezionato(ev)}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
            <h3 style={{ fontSize: 17, margin: '6px 0 4px' }}>{ev.artista}</h3>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{ev.luogo}, {ev.citta}</p>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{new Date(ev.data).toLocaleDateString('it-IT')}</p>
          </div>
        ))}
        {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento ancora — creane uno dalla sezione Eventi.</p>}
      </div>

      {selezionato && (
        <SchedaEventoModale evento={selezionato} tabIniziale="partenze" onClose={() => setSelezionato(null)} onSalvato={ricarica} />
      )}
    </div>
  );
}
