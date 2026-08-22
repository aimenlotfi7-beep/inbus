import { useEffect, useState } from 'react';
import { utentiApi, type Utente, type PrenotazioneUtente } from '../../api/utenti';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

export function UtentiScreen() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [selezionato, setSelezionato] = useState<Utente | null>(null);
  const [prenotazioni, setPrenotazioni] = useState<PrenotazioneUtente[] | null>(null);

  useEffect(() => { utentiApi.list().then(setUtenti); }, []);

  const utentiFiltrati = ricerca.trim()
    ? utenti.filter((u) => `${u.nome ?? ''} ${u.cognome ?? ''} ${u.email} ${u.citta ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : utenti;

  async function apriUtente(u: Utente) {
    setSelezionato(u);
    setPrenotazioni(null);
    const dati = await utentiApi.getById(u.id);
    setPrenotazioni(dati.prenotazioni);
  }

  return (
    <div>
      <PanelHead titolo="Utenti" />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o città..." />
      <TabellaGenerica
        righe={utentiFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (u) => <button className="btn btn-ghost" style={{ padding: 0, fontSize: 14, color: 'var(--paper)', textDecoration: 'underline' }} onClick={() => apriUtente(u)}>{`${u.nome ?? ''} ${u.cognome ?? ''}`.trim() || '—'}</button> },
          { etichetta: 'Email', render: (u) => u.email },
          { etichetta: 'Telefono', render: (u) => u.telefono ?? '—' },
          { etichetta: 'Città', render: (u) => u.citta ?? '—' },
          { etichetta: 'Cliente dal', render: (u) => new Date(u.creatoIl).toLocaleDateString('it-IT') },
          { etichetta: 'Credito', render: (u) => Number(u.creditoDisponibile) > 0 ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>€{Number(u.creditoDisponibile).toFixed(2)}</span> : '—' },
        ]}
      />

      {selezionato && (
        <Modale titolo={`${selezionato.nome ?? ''} ${selezionato.cognome ?? ''}`.trim() || selezionato.email} onClose={() => setSelezionato(null)}>
          <p className="testo-intro">{selezionato.email}{selezionato.telefono ? ` · ${selezionato.telefono}` : ''}</p>
          {Number(selezionato.creditoDisponibile) > 0 && (
            <p className="testo-intro" style={{ color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>
              Credito fedeltà disponibile: €{Number(selezionato.creditoDisponibile).toFixed(2)}
            </p>
          )}
          <p className="section-label">Prenotazioni</p>
          {prenotazioni === null && <p className="testo-intro">Carico...</p>}
          {prenotazioni !== null && prenotazioni.length === 0 && <p className="testo-intro">Nessuna prenotazione ancora.</p>}
          {prenotazioni?.map((p) => (
            <div key={p.id} className="riga-cliccabile" style={{ cursor: 'default' }}>
              <span className="riga-titolo">{p.artista} · {p.pnr}<br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{new Date(p.dataEvento).toLocaleDateString('it-IT')} · {p.passeggeri} passeggero/i · €{Number(p.totale).toFixed(2)}</span></span>
              <span className={`badge ${p.stato === 'CONFERMATA' ? 'coperta' : 'non-coperta'}`}>{p.stato === 'CONFERMATA' ? 'Confermata' : 'Cancellata'}</span>
            </div>
          ))}
        </Modale>
      )}
    </div>
  );
}
