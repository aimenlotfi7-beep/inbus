import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { eventiApi } from '../../api/eventi';
import { ErroreApi } from '../../api/client';
import { prezzoMinimoEvento } from '../../api/prezzi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';
import { useSelezioneUrl } from '../shared/useSelezioneUrl';
import { Modale } from '../shared/Modale';
import { formattaEuro } from '../../shared/formato';

export function EventiScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<Evento | null>(null);
  // L'evento aperto sopravvive a un ricaricamento della pagina (?eventoId=
  // nell'URL) — prima si perdeva sempre, tornando all'elenco.
  const { id: eventoIdUrl, apri: apriUrl, chiudi: chiudiUrl } = useSelezioneUrl('eventi', 'eventoId');
  const [nuovoInCorso, setNuovoInCorso] = useState(false);
  const modaleAperta = nuovoInCorso || !!eventoIdUrl;
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
      setNuovoInCorso(true);
    }
  }, []);
  // Se invece era aperto un evento ESISTENTE (eventoId nell'URL), lo
  // ricarico fresco dal server all'avvio — stesso identico fetch che fa
  // apriModifica, solo innescato dall'URL invece che da un clic.
  useEffect(() => {
    if (!eventoIdUrl) return;
    eventiApi.getById(eventoIdUrl).then(setInModifica).catch(() => chiudiUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apriNuovo() {
    setInModifica(null);
    setNuovoInCorso(true);
  }
  // Sempre un fetch fresco dal server, non l'oggetto già in memoria
  // dalla lista — quella lista potrebbe non riflettere l'ultimo stato
  // vero (es. tragitti aggiunti in un salvataggio precedente non
  // ancora ricaricato in questa schermata), mostrando dati vecchi
  // nell'editor pur essendo tutto corretto sul server.
  async function apriModifica(ev: Evento) {
    apriUrl(ev.id);
    setInModifica(ev); // subito, per non far vedere un editor vuoto mentre carica
    try {
      const fresco = await eventiApi.getById(ev.id);
      setInModifica(fresco);
    } catch {
      // Se il fetch fallisce (rete, evento cancellato nel frattempo),
      // resta comunque la versione già in memoria — meglio di niente.
    }
  }

  // Conferma nel modale del gestionale invece di confirm() del browser
  // (non stilizzato, testo generico): dice anche che l'evento va nel
  // Cestino e si può ripristinare da lì.
  const [daEliminare, setDaEliminare] = useState<Evento | null>(null);
  async function elimina(ev: Evento) {
    setDaEliminare(null);
    try {
      await eventiApi.remove(ev.id);
      ricarica();
      notifica(`"${ev.artista}" spostato nel Cestino.`, 'successo');
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : "Eliminazione non riuscita: impossibile contattare il server.");
    }
  }

  if (modaleAperta) {
    return <SchedaEventoModale evento={inModifica} tabIniziale="dettagli" soloQuestaTab onClose={() => { setNuovoInCorso(false); chiudiUrl(); setInModifica(null); }} onSalvato={ricarica} />;
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
                  {p !== null ? <b style={{ color: 'var(--paper)' }}>da {formattaEuro(p)}</b> : ''}
                  {!ev.visibileSito && ' · nascosto'}
                </p>
              );
            })()}
            footer={
              // "Modifica" scritto (il clic sulla card apre già la scheda) ed
              // "Elimina" meno in evidenza: prima l'unica azione visibile era
              // proprio quella distruttiva, in rosso a 10,5px.
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 'var(--testo-sm)', fontWeight: 600, color: 'var(--blue)' }}>Modifica →</span>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', padding: '2px 6px', border: 'none' }} onClick={(e) => { e.stopPropagation(); setDaEliminare(ev); }} aria-label={`Elimina ${ev.artista}`}>
                  Elimina
                </button>
              </div>
            }
          />
        ))}
        {!eventiFiltrati.length && (
          <p style={{ color: 'var(--mist)' }}>
            {ricerca ? 'Nessun evento trovato.' : tab === 'futuri' ? 'Nessun evento in programma.' : 'Nessun evento passato ancora.'}
          </p>
        )}
      </div>

      {daEliminare && (
        <Modale titolo="Eliminare l'evento?" onClose={() => setDaEliminare(null)}>
          <p style={{ marginBottom: 16 }}>
            <b>{daEliminare.artista}</b> ({daEliminare.citta}, {new Date(daEliminare.data).toLocaleDateString('it-IT')}) finisce nel Cestino: sparisce dal sito e dagli elenchi, ma puoi ripristinarlo dalla sezione Cestino.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setDaEliminare(null)}>Annulla</button>
            <button type="button" className="btn btn-primary" style={{ background: 'var(--pink)', color: '#fff' }} onClick={() => elimina(daEliminare)}>Sposta nel Cestino</button>
          </div>
        </Modale>
      )}
    </div>
  );
}
