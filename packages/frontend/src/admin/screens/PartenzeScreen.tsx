import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

type Tab = 'da-lavorare' | 'lavorate' | 'passate';

/**
 * Elenco eventi pensato per arrivare rapidamente alla gestione delle
 * partenze: click su un evento → si apre la sua scheda già sulla tab
 * "Partenze" (niente selettore/tendina, solo la lista da cui scegliere).
 *
 * "Da lavorare" (ha tratte con posti superati) e "Lavorate" (nessuna)
 * si aggiornano da sole in base ai dati reali, nessuno stato da
 * segnare a mano — se una partenza già lavorata torna ad avere posti
 * superati (es. per un eccesso di nuove prenotazioni), torna da sola
 * nella tab "Da lavorare".
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [selezionato, setSelezionato] = useState<Evento | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [allertePerEvento, setAllertePerEvento] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>('da-lavorare');

  function ricarica() {
    eventiApi.list().then(setEventi);
    eventiApi.allertePartenzePerEvento().then(setAllertePerEvento).catch(() => {});
  }
  useEffect(ricarica, []);

  const adesso = Date.now();
  const eventiPerTab = eventi.filter((ev) => {
    const passato = new Date(ev.data).getTime() < adesso;
    if (tab === 'passate') return passato;
    if (passato) return false; // un evento passato vive solo nella tab "Passate", mai nelle altre due
    return tab === 'da-lavorare' ? (allertePerEvento[ev.id] ?? 0) > 0 : !(allertePerEvento[ev.id] > 0);
  });
  const eventiFiltrati = ricerca.trim()
    ? eventiPerTab.filter((ev) => `${ev.artista} ${ev.citta} ${ev.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventiPerTab;

  if (selezionato) {
    return <SchedaEventoModale evento={selezionato} tabIniziale="partenze" soloQuestaTab onClose={() => setSelezionato(null)} onSalvato={ricarica} />;
  }

  return (
    <div>
      <PanelHead titolo="Partenze" />
      <p className="testo-intro">Scegli un evento per vedere il calcolo bus, la copertura delle tratte e i bus censiti.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="mini-tabs" style={{ justifyContent: 'center', marginBottom: 20 }}>
        <button type="button" className={`mini-tab${tab === 'da-lavorare' ? ' active' : ''}`} onClick={() => setTab('da-lavorare')}>Da lavorare</button>
        <button type="button" className={`mini-tab${tab === 'lavorate' ? ' active' : ''}`} onClick={() => setTab('lavorate')}>Lavorate</button>
        <button type="button" className={`mini-tab${tab === 'passate' ? ' active' : ''}`} onClick={() => setTab('passate')}>Passate</button>
      </div>

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => setSelezionato(ev)}
            richiedeIntervento={tab === 'da-lavorare'}
            badge={allertePerEvento[ev.id] > 0 ? <>⚠ {allertePerEvento[ev.id]}</> : undefined}
          />
        ))}
        {!eventiFiltrati.length && (
          <p style={{ color: 'var(--mist)' }}>
            {ricerca ? 'Nessun evento trovato.' : tab === 'da-lavorare' ? 'Nessuna partenza da lavorare al momento.' : tab === 'lavorate' ? 'Nessuna partenza già lavorata.' : 'Nessun evento passato ancora.'}
          </p>
        )}
      </div>
    </div>
  );
}
