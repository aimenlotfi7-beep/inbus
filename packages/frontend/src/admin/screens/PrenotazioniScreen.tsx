import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { prenotazioniAdminApi, type PrenotazioneRiga } from '../../api/prenotazioniAdmin';
import { ErroreApi } from '../../api/client';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';

type SottoTab = 'CONFERMATA' | 'CANCELLATA';

export function PrenotazioniScreen() {
  const [ricercaEventi, setRicercaEventi] = useState('');
  const [risultatiEventi, setRisultatiEventi] = useState<Evento[]>([]);
  const [eventoAttivo, setEventoAttivo] = useState<Evento | null>(null);
  const [sottoTab, setSottoTab] = useState<SottoTab>('CONFERMATA');
  const [ricercaPrenotazioni, setRicercaPrenotazioni] = useState('');
  const [righe, setRighe] = useState<PrenotazioneRiga[]>([]);
  const [caricamento, setCaricamento] = useState(false);

  // Ricerca eventi (stile ricerca home) — mostra risultati mentre digiti.
  useEffect(() => {
    if (!ricercaEventi.trim()) { setRisultatiEventi([]); return; }
    const timeout = setTimeout(() => {
      eventiApi.list({ ricerca: ricercaEventi.trim() }).then(setRisultatiEventi);
    }, 250);
    return () => clearTimeout(timeout);
  }, [ricercaEventi]);

  function ricaricaPrenotazioni() {
    if (!eventoAttivo) return;
    setCaricamento(true);
    prenotazioniAdminApi.listAll({ eventoId: eventoAttivo.id, stato: sottoTab, ricerca: ricercaPrenotazioni.trim() || undefined })
      .then(setRighe)
      .finally(() => setCaricamento(false));
  }
  useEffect(ricaricaPrenotazioni, [eventoAttivo, sottoTab]);
  useEffect(() => {
    if (!eventoAttivo) return;
    const timeout = setTimeout(ricaricaPrenotazioni, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaPrenotazioni]);

  function apriEvento(ev: Evento) {
    setEventoAttivo(ev);
    setSottoTab('CONFERMATA');
    setRicercaPrenotazioni('');
    setRicercaEventi('');
    setRisultatiEventi([]);
  }

  async function cancella(r: PrenotazioneRiga) {
    if (!confirm(`Cancellare la prenotazione ${r.pnr}? I posti torneranno disponibili. Resterà nello storico (tab "Cancellate").`)) return;
    try {
      await prenotazioniAdminApi.cancella(r.pnr);
      ricaricaPrenotazioni();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Cancellazione non riuscita: ${e.message}` : 'Cancellazione non riuscita: impossibile contattare il server.');
    }
  }
  async function eliminaDefinitivamente(r: PrenotazioneRiga) {
    if (!confirm(`Eliminare DEFINITIVAMENTE la prenotazione ${r.pnr}? Non è recuperabile, sparisce anche dallo storico.`)) return;
    try {
      await prenotazioniAdminApi.eliminaDefinitivamente(r.pnr);
      ricaricaPrenotazioni();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Eliminazione non riuscita: ${e.message}` : 'Eliminazione non riuscita: impossibile contattare il server.');
    }
  }

  return (
    <div>
      <PanelHead titolo="Prenotazioni" />

      {!eventoAttivo ? (
        <>
          <p className="testo-intro">Cerca l'evento di cui vuoi vedere le prenotazioni.</p>
          <input
            placeholder="Cerca per artista, città o luogo..."
            value={ricercaEventi}
            onChange={(e) => setRicercaEventi(e.target.value)}
            style={{ maxWidth: 420, marginBottom: 18 }}
          />
          <div className="cards-list">
            {risultatiEventi.map((ev) => (
              <div key={ev.id} className="evento-card" onClick={() => apriEvento(ev)}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
                <h3 style={{ fontSize: 17, margin: '6px 0 4px' }}>{ev.artista}</h3>
                <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{ev.luogo}, {ev.citta}</p>
                <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{new Date(ev.data).toLocaleDateString('it-IT')}</p>
              </div>
            ))}
            {ricercaEventi.trim() && risultatiEventi.length === 0 && (
              <p className="testo-intro">Nessun evento trovato per "{ricercaEventi}".</p>
            )}
          </div>
        </>
      ) : (
        <>
          <button className="btn btn-ghost" style={{ marginBottom: 14, fontSize: 12.5 }} onClick={() => setEventoAttivo(null)}>← Cambia evento</button>
          <h3 style={{ fontSize: 18, marginBottom: 4 }}>{eventoAttivo.artista}</h3>
          <p className="testo-intro" style={{ marginBottom: 16 }}>{eventoAttivo.luogo}, {eventoAttivo.citta} · {new Date(eventoAttivo.data).toLocaleDateString('it-IT')}</p>

          <div className="mini-tabs">
            <button type="button" className={`mini-tab${sottoTab === 'CONFERMATA' ? ' active' : ''}`} onClick={() => setSottoTab('CONFERMATA')}>Confermate</button>
            <button type="button" className={`mini-tab${sottoTab === 'CANCELLATA' ? ' active' : ''}`} onClick={() => setSottoTab('CANCELLATA')}>Cancellate</button>
          </div>

          <input
            placeholder="Cerca per PNR, cliente o partecipante..."
            value={ricercaPrenotazioni}
            onChange={(e) => setRicercaPrenotazioni(e.target.value)}
            style={{ maxWidth: 420, marginBottom: 16 }}
          />

          {caricamento && <p className="testo-intro">Carico...</p>}

          {!caricamento && righe.length === 0 && (
            <p className="testo-intro">Nessuna prenotazione {sottoTab === 'CONFERMATA' ? 'confermata' : 'cancellata'} {ricercaPrenotazioni ? 'per questa ricerca' : 'per questo evento'}.</p>
          )}

          {righe.map((r) => (
            <div key={r.id} className="section-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                <div>
                  <h3 style={{ fontSize: 15 }}>{r.pnr}</h3>
                  <p className="section-sub">{r.clienteNome} {r.clienteCognome ?? ''} · {r.clienteEmail}{r.clienteTelefono ? ` · ${r.clienteTelefono}` : ''}</p>
                </div>
                <span className={`badge ${r.stato === 'CONFERMATA' ? 'coperta' : 'non-coperta'}`}>
                  {r.stato === 'CONFERMATA' ? 'Confermata' : 'Cancellata'}
                </span>
              </div>

              <p style={{ fontSize: 13.5, marginBottom: 8 }}>
                {r.passeggeri} passeggero/i · €{Number(r.totale).toFixed(2)} · {new Date(r.creataIl).toLocaleDateString('it-IT')}
              </p>

              {r.partecipanti.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {r.partecipanti.map((p, i) => (
                    <span key={i} className="chip">{p.nome} {p.cognome}</span>
                  ))}
                </div>
              )}

              {r.stato === 'CONFERMATA' ? (
                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)' }} onClick={() => cancella(r)}>Cancella</button>
              ) : (
                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)' }} onClick={() => eliminaDefinitivamente(r)}>Elimina definitivamente</button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
