import { useEffect, useRef, useState } from 'react';
import { utentiApi, type Utente, type PrenotazioneUtente } from '../../api/utenti';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';
import { motivoErrore } from '../shared/errori';
import { statoPrenotazioneAdmin } from '../shared/statoPrenotazioneAdmin';
import { formattaData, formattaEuro, plurale } from '../../shared/formato';

export function UtentiScreen() {
  const [utenti, setUtenti] = useState<Utente[] | null>(null);
  const [erroreElenco, setErroreElenco] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [selezionato, setSelezionato] = useState<Utente | null>(null);
  const [prenotazioni, setPrenotazioni] = useState<PrenotazioneUtente[] | null>(null);
  const [errorePrenotazioni, setErrorePrenotazioni] = useState('');
  const utenteAperto = useRef<string | null>(null);

  function caricaElenco() {
    setErroreElenco('');
    utentiApi.list().then(setUtenti).catch((e) => setErroreElenco(motivoErrore(e)));
  }
  useEffect(caricaElenco, []);

  const elenco = utenti ?? [];
  const utentiFiltrati = ricerca.trim()
    ? elenco.filter((u) => `${u.nome ?? ''} ${u.cognome ?? ''} ${u.email} ${u.citta ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : elenco;

  function apriUtente(u: Utente) {
    // Solo la risposta del cliente aperto per ultimo: prima, aprendo un
    // altro cliente durante il caricamento, compariva lo storico di quello prima.
    utenteAperto.current = u.id;
    setSelezionato(u);
    setPrenotazioni(null);
    setErrorePrenotazioni('');
    utentiApi.getById(u.id)
      .then((dati) => { if (utenteAperto.current === u.id) setPrenotazioni(dati.prenotazioni); })
      .catch((e) => { if (utenteAperto.current === u.id) setErrorePrenotazioni(motivoErrore(e)); });
  }

  return (
    <div>
      <PanelHead titolo="Utenti" />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o città…" />
      {erroreElenco && (
        <p className="avviso avviso-errore" role="alert">
          Clienti non caricati: {erroreElenco}{' '}
          <button type="button" className="btn btn-ghost btn-piccolo" onClick={caricaElenco}>Riprova</button>
        </p>
      )}
      {utenti === null && !erroreElenco && <p className="testo-intro">Carico…</p>}
      {utenti !== null && (
        <TabellaGenerica
          righe={utentiFiltrati}
          colonne={[
            { etichetta: 'Nome', render: (u) => <button className="btn btn-ghost" style={{ padding: 0, fontSize: 'var(--testo-base)', color: 'var(--paper)', textDecoration: 'underline' }} onClick={() => apriUtente(u)}>{`${u.nome ?? ''} ${u.cognome ?? ''}`.trim() || '—'}</button> },
            { etichetta: 'Email', render: (u) => u.email },
            { etichetta: 'Telefono', render: (u) => u.telefono ?? '—' },
            { etichetta: 'Città', render: (u) => u.citta ?? '—' },
            { etichetta: 'Cliente dal', render: (u) => formattaData(u.creatoIl) },
            { etichetta: 'Credito', render: (u) => Number(u.creditoDisponibile) > 0 ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>{formattaEuro(u.creditoDisponibile)}</span> : '—' },
          ]}
        />
      )}

      {selezionato && (
        <Modale titolo={`${selezionato.nome ?? ''} ${selezionato.cognome ?? ''}`.trim() || selezionato.email} onClose={() => { utenteAperto.current = null; setSelezionato(null); }}>
          <p className="testo-intro">{selezionato.email}{selezionato.telefono ? ` · ${selezionato.telefono}` : ''}</p>
          {Number(selezionato.creditoDisponibile) > 0 && (
            <p className="testo-intro" style={{ color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>
              Credito fedeltà disponibile: {formattaEuro(selezionato.creditoDisponibile)}
            </p>
          )}
          <p className="section-label">Prenotazioni</p>
          {errorePrenotazioni && (
            <p className="avviso avviso-errore" role="alert">
              Prenotazioni non caricate: {errorePrenotazioni}{' '}
              <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => apriUtente(selezionato)}>Riprova</button>
            </p>
          )}
          {prenotazioni === null && !errorePrenotazioni && <p className="testo-intro">Carico…</p>}
          {prenotazioni !== null && prenotazioni.length === 0 && <p className="testo-intro">Nessuna prenotazione ancora.</p>}
          {prenotazioni?.map((p) => {
            const stato = statoPrenotazioneAdmin(p);
            return (
              <div key={p.id} className="riga-cliccabile" style={{ cursor: 'default' }}>
                <span className="riga-titolo">{p.artista} · {p.pnr}<br /><span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>{formattaData(p.dataEvento)} · {plurale(p.passeggeri, 'passeggero', 'passeggeri')} · {formattaEuro(p.totale)}</span></span>
                <span className={`badge ${stato.classe}`}>{stato.etichetta}</span>
              </div>
            );
          })}
        </Modale>
      )}
    </div>
  );
}
