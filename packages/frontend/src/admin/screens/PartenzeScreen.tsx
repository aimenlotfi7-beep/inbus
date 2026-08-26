import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
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
          <div key={ev.id} className="evento-card" onClick={() => setSelezionato(ev)}>
            {ev.immagini[0]?.url && (
              <div style={{ width: '100%', aspectRatio: '1080 / 1350', borderRadius: 8, overflow: 'hidden', marginBottom: 10, background: 'var(--night)' }}>
                <img src={ev.immagini[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            )}
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
            {allertePerEvento[ev.id] > 0 && (
              <span className="badge non-coperta" style={{ float: 'right' }} title={`${allertePerEvento[ev.id]} tratta/e con posti superati`}>⚠ {allertePerEvento[ev.id]}</span>
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
