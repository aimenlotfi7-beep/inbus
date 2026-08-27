import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { ErroreApi } from '../../api/client';
import { prezzoMinimoEvento } from '../../api/prezzi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

export function EventiScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<Evento | null>(null);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [tab, setTab] = useState<'futuri' | 'passati'>('futuri');

  function ricarica() {
    eventiApi.list().then(setEventi);
  }
  useEffect(ricarica, []);

  const oggi = new Date();
  const eventiTab = eventi.filter((ev) => tab === 'futuri' ? new Date(ev.data) >= oggi : new Date(ev.data) < oggi);
  const eventiFiltrati = ricerca.trim()
    ? eventiTab.filter((ev) => `${ev.artista} ${ev.genere} ${ev.citta} ${ev.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventiTab;

  async function apriNuovo() {
    const bozzaId = localStorage.getItem('inbus_bozza_evento_id');
    if (bozzaId) {
      const riprendi = confirm('Hai una bozza di un evento non ancora completato — vuoi riprenderla da dove l\'avevi lasciata?');
      if (riprendi) {
        try {
          const bozza = await eventiApi.getById(bozzaId);
          setInModifica(bozza);
          setModaleAperta(true);
          return;
        } catch {
          // La bozza non esiste più (es. cancellata da un altro admin) —
          // proseguo con un evento vuoto invece di bloccare tutto qui.
          localStorage.removeItem('inbus_bozza_evento_id');
        }
      } else {
        localStorage.removeItem('inbus_bozza_evento_id');
      }
    }
    setInModifica(null);
    setModaleAperta(true);
  }
  function apriModifica(ev: Evento) { setInModifica(ev); setModaleAperta(true); }

  async function elimina(ev: Evento) {
    if (!confirm(`Eliminare l'evento "${ev.artista}"?`)) return;
    try {
      await eventiApi.remove(ev.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : "Eliminazione non riuscita: impossibile contattare il server.");
    }
  }

  if (modaleAperta) {
    return <SchedaEventoModale evento={inModifica} tabIniziale="dettagli" soloQuestaTab onClose={() => setModaleAperta(false)} onSalvato={ricarica} />;
  }

  return (
    <div>
      <PanelHead titolo="Eventi" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo evento</button>} />

      <div className="mini-tabs">
        <button type="button" className={`mini-tab${tab === 'futuri' ? ' active' : ''}`} onClick={() => setTab('futuri')}>In programma</button>
        <button type="button" className={`mini-tab${tab === 'passati' ? ' active' : ''}`} onClick={() => setTab('passati')}>Passati</button>
      </div>

      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, genere o città..." />

      <div className="cards-list">
        {eventiFiltrati.map((ev) => (
          <EventoCardCompatta
            key={ev.id}
            evento={{ ...ev, immagineUrl: ev.immagini[0]?.url ?? null }}
            onClick={() => apriModifica(ev)}
            opacitaRidotta={tab === 'passati'}
            mostraLinkPubblico
            badge={ev.bozza ? 'Bozza' : undefined}
            extra={(() => {
              const p = prezzoMinimoEvento(ev);
              return (
                <p>
                  {p !== null ? <b style={{ color: 'var(--paper)' }}>da €{p.toFixed(2)}</b> : ''}
                  {!ev.visibileSito && ' · nascosto'}
                </p>
              );
            })()}
            footer={
              <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--pink)', padding: 0 }} onClick={(e) => { e.stopPropagation(); elimina(ev); }}>
                Elimina
              </button>
            }
          />
        ))}
        {!eventiFiltrati.length && (
          <p style={{ color: 'var(--mist)' }}>
            {ricerca ? 'Nessun evento trovato.' : tab === 'futuri' ? 'Nessun evento in programma.' : 'Nessun evento passato ancora.'}
          </p>
        )}
      </div>
    </div>
  );
}
