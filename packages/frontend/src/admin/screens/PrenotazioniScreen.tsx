import { useEffect, useState } from 'react';
import { prenotazioniAdminApi, type PrenotazioneRiga, type EventoConPrenotazioni } from '../../api/prenotazioniAdmin';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';

type SottoTab = 'CONFERMATA' | 'CANCELLATA';

export function PrenotazioniScreen() {
  const [eventiConPren, setEventiConPren] = useState<EventoConPrenotazioni[]>([]);
  const [ricercaTab, setRicercaTab] = useState('');
  const [eventoAttivoId, setEventoAttivoId] = useState<string | null>(null);
  const [sottoTab, setSottoTab] = useState<SottoTab>('CONFERMATA');
  const [ricercaPrenotazioni, setRicercaPrenotazioni] = useState('');
  const [righe, setRighe] = useState<PrenotazioneRiga[]>([]);
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    prenotazioniAdminApi.eventiConPrenotazioni().then((lista) => {
      setEventiConPren(lista);
      if (lista[0]) setEventoAttivoId(lista[0].id);
    });
  }, []);

  const eventoAttivo = eventiConPren.find((e) => e.id === eventoAttivoId) ?? null;
  const tabFiltrate = ricercaTab.trim()
    ? eventiConPren.filter((e) => e.artista.toLowerCase().includes(ricercaTab.toLowerCase()) || e.citta.toLowerCase().includes(ricercaTab.toLowerCase()))
    : eventiConPren;

  function ricaricaPrenotazioni() {
    if (!eventoAttivoId) return;
    setCaricamento(true);
    prenotazioniAdminApi.listAll({ eventoId: eventoAttivoId, stato: sottoTab, ricerca: ricercaPrenotazioni.trim() || undefined })
      .then(setRighe)
      .finally(() => setCaricamento(false));
  }
  useEffect(ricaricaPrenotazioni, [eventoAttivoId, sottoTab]);
  useEffect(() => {
    if (!eventoAttivoId) return;
    const timeout = setTimeout(ricaricaPrenotazioni, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaPrenotazioni]);

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

      {eventiConPren.length === 0 ? (
        <p className="testo-intro">Nessun evento ha ancora prenotazioni.</p>
      ) : (
        <>
          {eventiConPren.length > 6 && (
            <div className="home-search-box" style={{ maxWidth: 480, margin: '0 0 20px' }}>
              <input
                placeholder="Cerca tra gli eventi con prenotazioni..."
                value={ricercaTab}
                onChange={(e) => setRicercaTab(e.target.value)}
                style={{ fontSize: 15, textAlign: 'left', padding: '10px 4px' }}
              />
            </div>
          )}

          <div className="cards-list" style={{ marginBottom: 24 }}>
            {tabFiltrate.map((ev) => (
              <div
                key={ev.id}
                className="evento-card"
                style={eventoAttivoId === ev.id ? { borderColor: 'var(--pink)' } : undefined}
                onClick={() => { setEventoAttivoId(ev.id); setSottoTab('CONFERMATA'); setRicercaPrenotazioni(''); }}
              >
                {ev.immagine && <div className="evento-card-thumb" style={{ backgroundImage: `url(${ev.immagine})` }} />}
                <span className="tag">{ev.genere}</span>
                <h3>{ev.artista}</h3>
                <p>{ev.luogo}, {ev.citta}</p>
                <p>{new Date(ev.data).toLocaleDateString('it-IT')}</p>
              </div>
            ))}
          </div>

          {eventoAttivo && (
            <>
              <p className="testo-intro" style={{ marginTop: -6, marginBottom: 16 }}>
                {eventoAttivo.luogo}, {eventoAttivo.citta} · {new Date(eventoAttivo.data).toLocaleDateString('it-IT')}
              </p>

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

              {righe.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>PNR</th>
                        <th>Cliente</th>
                        <th>Partecipanti</th>
                        <th>Passeggeri</th>
                        <th>Totale</th>
                        <th>Data</th>
                        <th>Stato</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((r) => (
                        <tr key={r.id}>
                          <td>{r.pnr}</td>
                          <td>{r.clienteNome} {r.clienteCognome ?? ''}<br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{r.clienteEmail}{r.clienteTelefono ? ` · ${r.clienteTelefono}` : ''}</span></td>
                          <td>
                            {r.partecipanti.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {r.partecipanti.map((p, i) => <span key={i} className="chip" style={{ fontSize: 11 }}>{p.nome} {p.cognome}</span>)}
                              </div>
                            ) : '—'}
                          </td>
                          <td>{r.passeggeri}</td>
                          <td>€{Number(r.totale).toFixed(2)}</td>
                          <td>{new Date(r.creataIl).toLocaleDateString('it-IT')}</td>
                          <td><span className={`badge ${r.stato === 'CONFERMATA' ? 'coperta' : 'non-coperta'}`}>{r.stato === 'CONFERMATA' ? 'Confermata' : 'Cancellata'}</span></td>
                          <td>
                            {r.stato === 'CONFERMATA' ? (
                              <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)', whiteSpace: 'nowrap' }} onClick={() => cancella(r)}>Cancella</button>
                            ) : (
                              <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)', whiteSpace: 'nowrap' }} onClick={() => eliminaDefinitivamente(r)}>Elimina def.</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
