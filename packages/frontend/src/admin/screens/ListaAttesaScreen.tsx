import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { listaAttesaApi } from '../../api/listaAttesa';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

type Tab = 'da-lavorare' | 'promosse' | 'passate';

/**
 * Elenco eventi pensato per arrivare rapidamente alla lista d'attesa:
 * click su un evento → si apre isolata su questa sola sezione (niente
 * Dettagli/Partenze/Offerte, solo la propria competenza).
 *
 * Compaiono SOLO gli eventi con almeno un'iscrizione — un evento senza
 * nessuno in lista d'attesa non ha nulla da mostrare qui. "Da
 * lavorare" (chi ha ancora iscrizioni in attesa) e "Promosse" (chi le
 * ha già lavorate tutte) si aggiornano da soli in base ai dati reali —
 * appena promuovi l'ultima iscrizione in attesa di un evento, sparisce
 * da "Da lavorare" e compare in "Promosse" senza bisogno di segnare
 * nulla a mano.
 */
export function ListaAttesaScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [selezionato, setSelezionato] = useState<Evento | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [conteggi, setConteggi] = useState<Record<string, { inAttesa: number; promosse: number }>>({});
  const [tab, setTab] = useState<Tab>('da-lavorare');

  function ricarica() {
    eventiApi.list().then(setEventi);
    listaAttesaApi.contaPerEventoEStato().then(setConteggi).catch(() => {});
  }
  useEffect(ricarica, []);

  const adesso = Date.now();
  const eventiConIscrizioni = eventi.filter((ev) => conteggi[ev.id]);
  const eventiPerTab = eventiConIscrizioni.filter((ev) => {
    const c = conteggi[ev.id];
    const passato = new Date(ev.data).getTime() < adesso;
    if (tab === 'passate') return passato;
    if (passato) return false; // un evento passato vive solo nella tab "Passate", mai nelle altre due
    return tab === 'da-lavorare' ? c.inAttesa > 0 : c.inAttesa === 0;
  });
  const eventiFiltrati = ricerca.trim()
    ? eventiPerTab.filter((ev) => `${ev.artista} ${ev.citta} ${ev.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventiPerTab;

  if (selezionato) {
    return <SchedaEventoModale evento={selezionato} tabIniziale="lista-attesa" soloQuestaTab onClose={() => setSelezionato(null)} onSalvato={ricarica} />;
  }

  return (
    <div>
      <PanelHead titolo="Lista d'attesa" info="Scegli un evento per vedere chi è in lista d'attesa e promuovere le iscrizioni." />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="mini-tabs" style={{ justifyContent: 'center', marginBottom: 20 }}>
        <button type="button" className={`mini-tab${tab === 'da-lavorare' ? ' active' : ''}`} onClick={() => setTab('da-lavorare')}>Da lavorare</button>
        <button type="button" className={`mini-tab${tab === 'promosse' ? ' active' : ''}`} onClick={() => setTab('promosse')}>Promosse</button>
        <button type="button" className={`mini-tab${tab === 'passate' ? ' active' : ''}`} onClick={() => setTab('passate')}>Passate</button>
      </div>

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => setSelezionato(ev)}
            richiedeIntervento={tab === 'da-lavorare'}
            badge={tab === 'da-lavorare' ? <>{conteggi[ev.id].inAttesa} in attesa</> : tab === 'promosse' ? <>{conteggi[ev.id].promosse} promosse</> : undefined}
          />
        ))}
        {!eventiFiltrati.length && (
          <p style={{ color: 'var(--mist)' }}>
            {ricerca ? 'Nessun evento trovato.' : tab === 'da-lavorare' ? 'Nessun evento con iscrizioni da lavorare.' : tab === 'promosse' ? 'Nessun evento con iscrizioni già promosse.' : 'Nessun evento passato con iscrizioni.'}
          </p>
        )}
      </div>
    </div>
  );
}
