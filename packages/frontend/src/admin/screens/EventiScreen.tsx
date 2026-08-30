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

  // Se la scheda di creazione era aperta quando la pagina è stata
  // ricaricata per sbaglio (F5, chiusura accidentale della scheda del
  // browser), la riapro da sola — il contenuto del form lo ripristina
  // SchedaEventoModale stessa dal suo salvataggio nel browser (vedi
  // lì). Cliccando "+ Nuovo evento" di proposito, invece, si parte
  // sempre vuoti — vedi apriNuovo più sotto, nessun controllo qui.
  useEffect(() => {
    if (localStorage.getItem('inbus_creazione_evento_in_corso')) {
      setInModifica(null);
      setModaleAperta(true);
    }
  }, []);

  function apriNuovo() {
    setInModifica(null);
    setModaleAperta(true);
  }
  // Sempre un fetch fresco dal server, non l'oggetto già in memoria
  // dalla lista — quella lista potrebbe non riflettere l'ultimo stato
  // vero (es. tragitti aggiunti in un salvataggio precedente non
  // ancora ricaricato in questa schermata), mostrando dati vecchi
  // nell'editor pur essendo tutto corretto sul server.
  async function apriModifica(ev: Evento) {
    setModaleAperta(true);
    setInModifica(ev); // subito, per non far vedere un editor vuoto mentre carica
    try {
      const fresco = await eventiApi.getById(ev.id);
      setInModifica(fresco);
    } catch {
      // Se il fetch fallisce (rete, evento cancellato nel frattempo),
      // resta comunque la versione già in memoria — meglio di niente.
    }
  }

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
