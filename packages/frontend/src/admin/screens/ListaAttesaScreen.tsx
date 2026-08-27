import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { listaAttesaApi } from '../../api/listaAttesa';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

/**
 * Elenco eventi pensato per arrivare rapidamente alla lista d'attesa:
 * click su un evento → si apre isolata su questa sola sezione (niente
 * Dettagli/Partenze/Offerte, solo la propria competenza).
 */
export function ListaAttesaScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [selezionato, setSelezionato] = useState<Evento | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [inAttesaPerEvento, setInAttesaPerEvento] = useState<Record<string, number>>({});

  function ricarica() {
    eventiApi.list().then(setEventi);
    listaAttesaApi.contaInAttesaPerEvento().then(setInAttesaPerEvento).catch(() => {});
  }
  useEffect(ricarica, []);

  const eventiFiltrati = ricerca.trim()
    ? eventi.filter((ev) => `${ev.artista} ${ev.citta} ${ev.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventi;

  if (selezionato) {
    return <SchedaEventoModale evento={selezionato} tabIniziale="lista-attesa" soloQuestaTab onClose={() => setSelezionato(null)} onSalvato={ricarica} />;
  }

  return (
    <div>
      <PanelHead titolo="Lista d'attesa" info="Scegli un evento per vedere chi è in lista d'attesa e promuovere le iscrizioni." />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => setSelezionato(ev)}
            richiedeIntervento={inAttesaPerEvento[ev.id] > 0}
            badge={inAttesaPerEvento[ev.id] > 0 ? <>{inAttesaPerEvento[ev.id]} in attesa</> : undefined}
          />
        ))}
        {!eventiFiltrati.length && <p style={{ color: 'var(--mist)' }}>{ricerca ? 'Nessun evento trovato.' : 'Nessun evento ancora — creane uno dalla sezione Eventi.'}</p>}
      </div>
    </div>
  );
}
