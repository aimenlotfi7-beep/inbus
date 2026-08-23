import { useEffect, useState } from 'react';
import { prenotazioniAdminApi, type PrenotazioneRiga, type EventoConPrenotazioni } from '../../api/prenotazioniAdmin';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { Modale } from '../shared/Modale';
import { RicercaSezione } from '../shared/RicercaSezione';

type SottoTab = 'CONFERMATA' | 'CANCELLATA';

const ETICHETTA_METODO: Record<string, string> = {
  CARTA: 'Carta',
  PAYPAL: 'PayPal',
  SATISPAY: 'Satispay',
  DA_CONCORDARE: 'Da concordare',
};

/** Quattro stati distinti, non tre: chi paga tutto subito è verde
 *  ("Confermata"); chi ha versato solo l'acconto e non ha ancora
 *  saldato è giallo ("Acconto"); chi aveva pagato ad acconto e HA GIÀ
 *  saldato il resto è blu ("Saldata") — voluto diverso dal verde, per
 *  distinguere a colpo d'occhio chi ha confermato subito da chi ci è
 *  arrivato in due tempi; cancellata resta rossa. Lo stesso identico
 *  record cambia colore da solo, appena il saldo viene completato. */
function statoRiga(r: PrenotazioneRiga): { classe: string; etichetta: string } {
  if (r.stato === 'CANCELLATA') return { classe: 'non-coperta', etichetta: 'Cancellata' };
  if (r.tipoPagamento === 'ACCONTO' && !r.saldoPagato) return { classe: 'attenzione', etichetta: 'Acconto' };
  if (r.tipoPagamento === 'ACCONTO' && r.saldoPagato) return { classe: 'saldata', etichetta: 'Saldata' };
  return { classe: 'coperta', etichetta: 'Confermata' };
}

export function PrenotazioniScreen() {
  const [eventiConPren, setEventiConPren] = useState<EventoConPrenotazioni[]>([]);
  const [ricercaTab, setRicercaTab] = useState('');
  const [mostraPassati, setMostraPassati] = useState(false);
  const [eventoAttivoId, setEventoAttivoId] = useState<string | null>(null);
  const [sottoTab, setSottoTab] = useState<SottoTab>('CONFERMATA');
  const [ricercaPrenotazioni, setRicercaPrenotazioni] = useState('');
  const [righe, setRighe] = useState<PrenotazioneRiga[]>([]);
  const [filtroPagamento, setFiltroPagamento] = useState<'TUTTI' | 'COMPLETO' | 'ACCONTO'>('TUTTI');
  const [filtroSaldo, setFiltroSaldo] = useState<'TUTTI' | 'SALDATO' | 'DA_SALDARE'>('TUTTI');
  const [caricamento, setCaricamento] = useState(false);
  const [passeggeriInModale, setPasseggeriInModale] = useState<PrenotazioneRiga | null>(null);
  const [storicoInModale, setStoricoInModale] = useState<PrenotazioneRiga | null>(null);

  useEffect(() => {
    prenotazioniAdminApi.eventiConPrenotazioni().then(setEventiConPren);
  }, []);

  const righeFiltrate = righe.filter((r) => {
    if (filtroPagamento !== 'TUTTI' && r.tipoPagamento !== filtroPagamento) return false;
    if (filtroSaldo === 'SALDATO' && !(r.tipoPagamento === 'COMPLETO' || r.saldoPagato)) return false;
    if (filtroSaldo === 'DA_SALDARE' && (r.tipoPagamento === 'COMPLETO' || r.saldoPagato)) return false;
    return true;
  });

  const eventoAttivo = eventiConPren.find((e) => e.id === eventoAttivoId) ?? null;
  const adesso = Date.now();
  const eventiPerData = eventiConPren.filter((e) => (mostraPassati ? new Date(e.data).getTime() < adesso : new Date(e.data).getTime() >= adesso));
  const tabFiltrate = ricercaTab.trim()
    ? eventiPerData.filter((e) => e.artista.toLowerCase().includes(ricercaTab.toLowerCase()) || e.citta.toLowerCase().includes(ricercaTab.toLowerCase()))
    : eventiPerData;

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
  async function rigeneraBiglietto(r: PrenotazioneRiga) {
    if (!confirm(`Rigenerare il biglietto per ${r.pnr}? Utile se non era mai stato emesso (es. per un problema tecnico) — non tocca il biglietto se esiste già.`)) return;
    try {
      await prenotazioniAdminApi.rigeneraBiglietto(r.pnr);
      alert('Fatto — se il cliente ora apre "I miei biglietti" nella sua area, dovrebbe trovarlo.');
    } catch (e) {
      alert(e instanceof ErroreApi ? `Non riuscito: ${e.message}` : 'Non riuscito: impossibile contattare il server.');
    }
  }

  return (
    <div>
      <PanelHead
        titolo="Prenotazioni"
        azione={
          <button type="button" className="btn btn-ghost" onClick={() => { setMostraPassati((v) => !v); setEventoAttivoId(null); setRicercaTab(''); }}>
            {mostraPassati ? '← Torna ai prossimi' : 'Viaggi passati'}
          </button>
        }
      />

      {eventiConPren.length === 0 ? (
        <p className="testo-intro">Nessun evento ha ancora prenotazioni.</p>
      ) : (
        <>
          {eventiPerData.length === 0 ? (
            <p className="testo-intro">{mostraPassati ? 'Nessun evento passato con prenotazioni.' : 'Nessun evento futuro con prenotazioni.'}</p>
          ) : (
            <>
              {eventiPerData.length > 6 && (
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
            </>
          )}

          {eventoAttivo && (
            <>
              <p className="testo-intro" style={{ marginTop: -6, marginBottom: 16 }}>
                {eventoAttivo.luogo}, {eventoAttivo.citta} · {new Date(eventoAttivo.data).toLocaleDateString('it-IT')}
              </p>

              <div className="mini-tabs">
                <button type="button" className={`mini-tab${sottoTab === 'CONFERMATA' ? ' active' : ''}`} onClick={() => setSottoTab('CONFERMATA')}>Confermate</button>
                <button type="button" className={`mini-tab${sottoTab === 'CANCELLATA' ? ' active' : ''}`} onClick={() => setSottoTab('CANCELLATA')}>Cancellate</button>
              </div>

              <RicercaSezione valore={ricercaPrenotazioni} onChange={setRicercaPrenotazioni} placeholder="Cerca per PNR, cliente o partecipante..." />

              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={filtroPagamento} onChange={(e) => setFiltroPagamento(e.target.value as typeof filtroPagamento)} style={{ maxWidth: 200 }}>
                  <option value="TUTTI">Tutti i pagamenti</option>
                  <option value="COMPLETO">Pagamento completo</option>
                  <option value="ACCONTO">Acconto</option>
                </select>
                <select value={filtroSaldo} onChange={(e) => setFiltroSaldo(e.target.value as typeof filtroSaldo)} style={{ maxWidth: 200 }}>
                  <option value="TUTTI">Qualsiasi stato saldo</option>
                  <option value="SALDATO">Saldato</option>
                  <option value="DA_SALDARE">Da saldare</option>
                </select>
              </div>

              {caricamento && <p className="testo-intro">Carico...</p>}

              {!caricamento && righeFiltrate.length === 0 && (
                <p className="testo-intro">Nessuna prenotazione {sottoTab === 'CONFERMATA' ? 'confermata' : 'cancellata'} per questi filtri.</p>
              )}

              {righeFiltrate.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>PNR</th>
                        <th>Cliente</th>
                        <th>Passeggeri</th>
                        <th>Metodo di pagamento</th>
                        <th>Totale</th>
                        <th>Data</th>
                        <th>Stato</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {righeFiltrate.map((r) => {
                        const stato = statoRiga(r);
                        return (
                          <tr key={r.id}>
                            <td>{r.pnr}</td>
                            <td>{r.clienteNome} {r.clienteCognome ?? ''}<br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{r.clienteEmail}{r.clienteTelefono ? ` · ${r.clienteTelefono}` : ''}</span></td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: 13, padding: '2px 10px', textDecoration: 'underline' }}
                                onClick={() => setPasseggeriInModale(r)}
                                title="Vedi nomi e dati dei passeggeri"
                              >
                                {r.passeggeri}
                              </button>
                            </td>
                            <td>{ETICHETTA_METODO[r.metodoPagamento] ?? r.metodoPagamento}</td>
                            <td>€{Number(r.totale).toFixed(2)}</td>
                            <td>{new Date(r.creataIl).toLocaleDateString('it-IT')}</td>
                            <td>
                              <button type="button" className="btn btn-ghost" style={{ padding: 0, border: 'none', background: 'none' }} onClick={() => setStoricoInModale(r)} title="Vedi lo storico">
                                <span className={`badge ${stato.classe}`}>{stato.etichetta}</span>
                              </button>
                            </td>
                            <td>
                              {r.stato === 'CONFERMATA' ? (
                                <>
                                  <button className="btn btn-ghost" style={{ fontSize: 12, whiteSpace: 'nowrap', marginRight: 6 }} onClick={() => rigeneraBiglietto(r)} title="Se il biglietto non è mai arrivato al cliente">
                                    🎫 Rigenera biglietto
                                  </button>
                                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)', whiteSpace: 'nowrap' }} onClick={() => cancella(r)}>Cancella</button>
                                </>
                              ) : (
                                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--pink)', whiteSpace: 'nowrap' }} onClick={() => eliminaDefinitivamente(r)}>Elimina def.</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {passeggeriInModale && (
        <Modale titolo={`Passeggeri — PNR ${passeggeriInModale.pnr}`} onClose={() => setPasseggeriInModale(null)}>
          <p className="testo-intro" style={{ marginBottom: 12 }}>
            Richiedente: <b style={{ color: 'var(--paper)' }}>{passeggeriInModale.clienteNome} {passeggeriInModale.clienteCognome ?? ''}</b>
            <br />{passeggeriInModale.clienteEmail}{passeggeriInModale.clienteTelefono ? ` · ${passeggeriInModale.clienteTelefono}` : ''}
          </p>
          {passeggeriInModale.partecipanti.length > 0 ? (
            <>
              <p className="section-label" style={{ marginBottom: 8 }}>Altri passeggeri</p>
              {passeggeriInModale.partecipanti.map((p, i) => (
                <div key={i} className="riga-cliccabile" style={{ cursor: 'default' }}>
                  <span className="riga-titolo">{p.nome} {p.cognome}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="testo-intro">Nessun altro passeggero oltre al richiedente (prenotazione per {passeggeriInModale.passeggeri} persona/e in totale — il richiedente conta come una di queste).</p>
          )}
        </Modale>
      )}

      {storicoInModale && (
        <Modale titolo={`Storico — PNR ${storicoInModale.pnr}`} onClose={() => setStoricoInModale(null)}>
          <div className="riepilogo-riga-evento"><span>Creata il</span><b>{new Date(storicoInModale.creataIl).toLocaleString('it-IT')}</b></div>
          <div className="riepilogo-riga-evento"><span>Tipo pagamento</span><b>{storicoInModale.tipoPagamento === 'COMPLETO' ? 'Pagamento completo' : 'Acconto'}</b></div>
          {storicoInModale.tipoPagamento === 'ACCONTO' && (
            <div className="riepilogo-riga-evento">
              <span>Saldo</span>
              <b>
                {storicoInModale.saldoPagato && storicoInModale.saldoPagatoIl
                  ? `Completato il ${new Date(storicoInModale.saldoPagatoIl).toLocaleString('it-IT')}`
                  : 'Non ancora completato'}
              </b>
            </div>
          )}
          <div className="riepilogo-riga-evento"><span>Metodo di pagamento</span><b>{ETICHETTA_METODO[storicoInModale.metodoPagamento] ?? storicoInModale.metodoPagamento}</b></div>
          <div className="riepilogo-riga-evento"><span>Stato attuale</span><b>{statoRiga(storicoInModale).etichetta}</b></div>
        </Modale>
      )}
    </div>
  );
}
