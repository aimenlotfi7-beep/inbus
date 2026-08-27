import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

/**
 * Elenco eventi pensato per arrivare rapidamente alla gestione delle
 * partenze: click su un evento → si apre la sua scheda già sulla tab
 * "Partenze" (niente selettore/tendina, solo la lista da cui scegliere).
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [selezionato, setSelezionato] = useState<Evento | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [allertePerEvento, setAllertePerEvento] = useState<Record<string, number>>({});

  function ricarica() {
    eventiApi.list().then(setEventi);
    eventiApi.allertePartenzePerEvento().then(setAllertePerEvento).catch(() => {});
  }
  useEffect(ricarica, []);

  const eventiFiltrati = ricerca.trim()
    ? eventi.filter((ev) => `${ev.artista} ${ev.citta} ${ev.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventi;

  if (selezionato) {
    return <SchedaEventoModale evento={selezionato} tabIniziale="partenze" soloQuestaTab onClose={() => setSelezionato(null)} onSalvato={ricarica} />;
  }

  return (
    <div>
      <PanelHead titolo="Partenze" />
      <p className="testo-intro">Scegli un evento per vedere il calcolo bus, la copertura delle tratte e i bus censiti.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => setSelezionato(ev)}
            richiedeIntervento={allertePerEvento[ev.id] > 0}
            badge={allertePerEvento[ev.id] > 0 ? <>⚠ {allertePerEvento[ev.id]}</> : undefined}
          />
        ))}
        {!eventiFiltrati.length && <p style={{ color: 'var(--mist)' }}>{ricerca ? 'Nessun evento trovato.' : 'Nessun evento ancora — creane uno dalla sezione Eventi.'}</p>}
      </div>
    </div>
  );
}
