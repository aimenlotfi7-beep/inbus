import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
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
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      {caricamento && <p className="testo-intro">Carico...</p>}
      {!caricamento && eventiOrdinati.length === 0 && <p className="testo-intro">Nessun evento trovato.</p>}

      <div className="cards-list">
        {eventiOrdinati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => setEventoScelto(ev)}
          />
        ))}
      </div>
    </div>
  );
}
