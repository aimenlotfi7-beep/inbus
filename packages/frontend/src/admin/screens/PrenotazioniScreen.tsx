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
                <h3 style={{ fontSize: 16, margin: 0 }}>{ev.artista}</h3>
                <p style={{ color: 'var(--mist)', fontSize: 12.5, marginTop: 6 }}>{new Date(ev.data).toLocaleDateString('it-IT')}</p>
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
        </>
      )}
    </div>
  );
}
