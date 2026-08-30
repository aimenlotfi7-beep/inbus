import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

/**
 * Elenco eventi pensato per arrivare rapidamente alle offerte: click su
 * un evento → si apre isolata su questa sola sezione (niente
 * Dettagli/Partenze/Lista d'attesa, solo la propria competenza).
 */
export function OfferteScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [selezionato, setSelezionato] = useState<Evento | null>(null);
  const [ricerca, setRicerca] = useState('');

  function ricarica() {
    eventiApi.list().then(setEventi);
  }
  useEffect(ricarica, []);

  const eventiFiltrati = ricerca.trim()
    ? eventi.filter((ev) => `${ev.artista} ${ev.citta} ${ev.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventi;

  // Sempre un fetch fresco dal server, non l'oggetto già in memoria —
  // quella lista potrebbe non riflettere l'ultimo stato vero.
  async function apriEvento(ev: Evento) {
    setSelezionato(ev); // subito, per non far vedere un editor vuoto mentre carica
    try {
      const fresco = await eventiApi.getById(ev.id);
      setSelezionato(fresco);
    } catch {
      // Se il fetch fallisce, resta la versione già in memoria.
    }
  }

  if (selezionato) {
    return <SchedaEventoModale evento={selezionato} tabIniziale="offerte" soloQuestaTab onClose={() => setSelezionato(null)} onSalvato={ricarica} />;
  }

  return (
    <div>
      <PanelHead titolo="Offerte" info="Scegli un evento per creare/gestire le sue offerte con sconto dedicato." />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <div key={ev.id} className="evento-card" onClick={() => apriEvento(ev)}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
            <h3 style={{ fontSize: 17, margin: '6px 0 4px' }}>{ev.artista}</h3>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{ev.luogo}, {ev.citta}</p>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{new Date(ev.data).toLocaleDateString('it-IT')}</p>
          </div>
        ))}
        {!eventiFiltrati.length && <p style={{ color: 'var(--mist)' }}>{ricerca ? 'Nessun evento trovato.' : 'Nessun evento ancora — creane uno dalla sezione Eventi.'}</p>}
      </div>
    </div>
  );
}
