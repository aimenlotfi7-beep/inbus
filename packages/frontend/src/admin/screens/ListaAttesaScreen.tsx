import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { listaAttesaApi } from '../../api/listaAttesa';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
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
      <PanelHead titolo="Lista d'attesa" />
      <p className="testo-intro">Scegli un evento per vedere chi è in lista d'attesa e promuovere le iscrizioni.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <div key={ev.id} className="evento-card" onClick={() => setSelezionato(ev)}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
            {inAttesaPerEvento[ev.id] > 0 && (
              <span className="badge attenzione" style={{ float: 'right' }} title={`${inAttesaPerEvento[ev.id]} in attesa`}>{inAttesaPerEvento[ev.id]} in attesa</span>
            )}
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
