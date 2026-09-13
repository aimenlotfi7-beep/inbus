import { useEffect, useRef, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { prenotazioniAdminApi, type PrenotazioneRiga, type EventoConPrenotazioni } from '../../api/prenotazioniAdmin';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { Modale } from '../shared/Modale';
import { RicercaSezione } from '../shared/RicercaSezione';
import { eventoPassato, formattaData, formattaDataOra, formattaEuro, plurale } from '../../shared/formato';
import { conferma, confermaConTesto } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';

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
  const [erroreCaricamento, setErroreCaricamento] = useState('');
  const [erroreEventi, setErroreEventi] = useState('');
  const [passeggeriInModale, setPasseggeriInModale] = useState<PrenotazioneRiga | null>(null);
  const [storicoInModale, setStoricoInModale] = useState<PrenotazioneRiga | null>(null);

  useEffect(() => {
    prenotazioniAdminApi.eventiConPrenotazioni().then(setEventiConPren).catch((e) => setErroreEventi(motivoErrore(e)));
  }, []);

  const righeFiltrate = righe.filter((r) => {
    if (filtroPagamento !== 'TUTTI' && r.tipoPagamento !== filtroPagamento) return false;
    if (filtroSaldo === 'SALDATO' && !(r.tipoPagamento === 'COMPLETO' || r.saldoPagato)) return false;
    if (filtroSaldo === 'DA_SALDARE' && (r.tipoPagamento === 'COMPLETO' || r.saldoPagato)) return false;
    return true;
  });

  const eventoAttivo = eventiConPren.find((e) => e.id === eventoAttivoId) ?? null;
  // Il giorno dell'evento resta tra i prossimi (ora di Roma), non tra i passati.
  const eventiPerData = eventiConPren.filter((e) => (mostraPassati ? eventoPassato(e.data) : !eventoPassato(e.data)));
  const tabFiltrate = ricercaTab.trim()
    ? eventiPerData.filter((e) => e.artista.toLowerCase().includes(ricercaTab.toLowerCase()) || e.citta.toLowerCase().includes(ricercaTab.toLowerCase()))
    : eventiPerData;

  // Solo la risposta dell'ultima richiesta conta: cambiando evento o scheda
  // le righe vecchie spariscono subito (prima restavano i PNR dell'evento
  // precedente, con Cancella ed Elimina attivi).
  const richiestaCorrente = useRef(0);
  function ricaricaPrenotazioni() {
    if (!eventoAttivoId) return;
    const numero = ++richiestaCorrente.current;
    setRighe([]);
    setErroreCaricamento('');
    setCaricamento(true);
    prenotazioniAdminApi.listAll({ eventoId: eventoAttivoId, stato: sottoTab, ricerca: ricercaPrenotazioni.trim() || undefined })
      .then((r) => { if (numero === richiestaCorrente.current) setRighe(r); })
      .catch((e) => { if (numero === richiestaCorrente.current) setErroreCaricamento(motivoErrore(e)); })
      .finally(() => { if (numero === richiestaCorrente.current) setCaricamento(false); });
  }
  useEffect(ricaricaPrenotazioni, [eventoAttivoId, sottoTab]);
  useEffect(() => {
    if (!eventoAttivoId) return;
    const timeout = setTimeout(ricaricaPrenotazioni, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaPrenotazioni]);

  async function cancella(r: PrenotazioneRiga) {
    // Il cliente riceve un'email di cancellazione: va detto prima, e il
    // motivo (facoltativo) è quello che leggerà.
    const motivo = await confermaConTesto({
      titolo: `Cancellare la prenotazione ${r.pnr}?`,
      testo: <>I posti tornano disponibili e la prenotazione resta nello storico (tab "Cancellate"). Il cliente riceve un'email di cancellazione.</>,
      conferma: 'Cancella prenotazione',
      pericolosa: true,
      campoTesto: { etichetta: "Motivo (facoltativo): lo legge il cliente nell'email", placeholder: "es. evento annullato dall'organizzatore" },
    });
    if (motivo === null) return;
    try {
      const esito = await prenotazioniAdminApi.cancella(r.pnr, motivo.trim() || undefined);
      ricaricaPrenotazioni();
      if (esito.clienteAvvisato === false) notifica("Prenotazione cancellata, ma l'email al cliente non è partita: avvisalo tu.", 'errore');
      else notifica(esito.clienteAvvisato ? 'Prenotazione cancellata: il cliente è stato avvisato via email.' : 'Prenotazione cancellata.', 'successo');
    } catch (e) {
      notifica(`Cancellazione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }
  async function eliminaDefinitivamente(r: PrenotazioneRiga) {
    const ok = await conferma({
      titolo: `Eliminare definitivamente la prenotazione ${r.pnr}?`,
      testo: 'Non è recuperabile: sparisce anche dallo storico.',
      conferma: 'Elimina definitivamente',
      pericolosa: true,
    });
    if (!ok) return;
    try {
      await prenotazioniAdminApi.eliminaDefinitivamente(r.pnr);
      ricaricaPrenotazioni();
      notifica(`Prenotazione ${r.pnr} eliminata.`, 'successo');
    } catch (e) {
      notifica(`Eliminazione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }
  async function rigeneraBiglietto(r: PrenotazioneRiga) {
    // Il biglietto indica il bus, quindi esiste solo dopo lo smistamento
    // per età del giorno prima: qui lo si rigenera e lo si manda di nuovo.
    const ok = await conferma({
      titolo: `Reinviare il biglietto di ${r.pnr}?`,
      testo: 'Il biglietto con il bus assegnato viene rigenerato e inviato di nuovo via email al cliente. Funziona solo dopo lo smistamento sui bus, il giorno prima della partenza.',
      conferma: 'Reinvia biglietto',
    });
    if (!ok) return;
    try {
      const { inviata } = await prenotazioniAdminApi.rigeneraBiglietto(r.pnr);
      notifica(inviata
        ? 'Biglietto reinviato al cliente via email.'
        : "Biglietto rigenerato, ma l'email al cliente non è partita: può comunque scaricarlo dalla sua area.", inviata ? 'successo' : 'errore');
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  if (eventoAttivo) {
    return (
      <PaginaSezione titolo={`Prenotazioni — ${eventoAttivo.artista}`} onIndietro={() => setEventoAttivoId(null)} larga>
        <p className="testo-intro" style={{ marginTop: -6, marginBottom: 16 }}>
          {eventoAttivo.luogo}, {eventoAttivo.citta} · {formattaData(eventoAttivo.data)}
        </p>

        <div className="mini-tabs">
          <button type="button" className={`mini-tab${sottoTab === 'CONFERMATA' ? ' active' : ''}`} onClick={() => setSottoTab('CONFERMATA')}>Confermate</button>
          <button type="button" className={`mini-tab${sottoTab === 'CANCELLATA' ? ' active' : ''}`} onClick={() => setSottoTab('CANCELLATA')}>Cancellate</button>
        </div>

        <RicercaSezione valore={ricercaPrenotazioni} onChange={setRicercaPrenotazioni} placeholder="Cerca per PNR, cliente o partecipante…" />

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

        {caricamento && <p className="testo-intro">Carico…</p>}

        {!caricamento && erroreCaricamento && (
          <p className="avviso avviso-errore" role="alert">
            Prenotazioni non caricate: {erroreCaricamento}{' '}
            <button type="button" className="btn btn-ghost btn-piccolo" onClick={ricaricaPrenotazioni}>Riprova</button>
          </p>
        )}

        {!caricamento && !erroreCaricamento && righeFiltrate.length === 0 && (
          <p className="testo-intro">Nessuna prenotazione {sottoTab === 'CONFERMATA' ? 'confermata' : 'cancellata'} per questi filtri.</p>
        )}

        {!caricamento && righeFiltrate.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PNR</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Passeggeri</th>
                  <th>Metodo di pagamento</th>
                  <th style={{ textAlign: 'right' }}>Totale</th>
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
                      <td><b>{r.pnr}</b></td>
                      <td>{r.clienteNome} {r.clienteCognome ?? ''}<br /><span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>{r.clienteEmail}{r.clienteTelefono ? ` · ${r.clienteTelefono}` : ''}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 'var(--testo-md)', padding: '2px 10px', textDecoration: 'underline' }}
                          onClick={() => setPasseggeriInModale(r)}
                          title="Vedi nomi e dati dei passeggeri"
                        >
                          {r.passeggeri}
                        </button>
                      </td>
                      <td>{ETICHETTA_METODO[r.metodoPagamento] ?? r.metodoPagamento}</td>
                      <td style={{ textAlign: 'right' }}><b>{formattaEuro(r.totale)}</b></td>
                      <td>{formattaData(r.creataIl)}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ padding: 0, border: 'none', background: 'none' }} onClick={() => setStoricoInModale(r)} title="Vedi lo storico">
                          <span className={`badge ${stato.classe}`}>{stato.etichetta}</span>
                        </button>
                      </td>
                      <td>
                        {r.stato === 'CONFERMATA' ? (
                          <>
                            <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', whiteSpace: 'nowrap', marginRight: 6 }} onClick={() => rigeneraBiglietto(r)} title="Rimanda al cliente il biglietto con il bus (dopo lo smistamento, il giorno prima della partenza)">
                              Reinvia biglietto
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', color: 'var(--pink)', whiteSpace: 'nowrap' }} onClick={() => cancella(r)}>Cancella</button>
                          </>
                        ) : (
                          <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', color: 'var(--pink)', whiteSpace: 'nowrap' }} onClick={() => eliminaDefinitivamente(r)}>Elimina def.</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
              <p className="testo-intro">Nessun altro passeggero oltre al richiedente (prenotazione per {plurale(passeggeriInModale.passeggeri, 'persona', 'persone')} in totale, richiedente compreso).</p>
            )}
          </Modale>
        )}

        {storicoInModale && (
          <Modale titolo={`Storico — PNR ${storicoInModale.pnr}`} onClose={() => setStoricoInModale(null)}>
            <div className="riepilogo-riga-evento"><span>Creata il</span><b>{formattaDataOra(storicoInModale.creataIl)}</b></div>
            <div className="riepilogo-riga-evento"><span>Tipo pagamento</span><b>{storicoInModale.tipoPagamento === 'COMPLETO' ? 'Pagamento completo' : 'Acconto'}</b></div>
            {storicoInModale.tipoPagamento === 'ACCONTO' && (
              <div className="riepilogo-riga-evento">
                <span>Saldo</span>
                <b>
                  {storicoInModale.saldoPagato && storicoInModale.saldoPagatoIl
                    ? `Completato il ${formattaDataOra(storicoInModale.saldoPagatoIl)}`
                    : 'Non ancora completato'}
                </b>
              </div>
            )}
            <div className="riepilogo-riga-evento"><span>Metodo di pagamento</span><b>{ETICHETTA_METODO[storicoInModale.metodoPagamento] ?? storicoInModale.metodoPagamento}</b></div>
            <div className="riepilogo-riga-evento"><span>Stato attuale</span><b>{statoRiga(storicoInModale).etichetta}</b></div>
          </Modale>
        )}
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead
        titolo="Prenotazioni"
        azione={
          <button type="button" className="btn btn-ghost" onClick={() => { setMostraPassati((v) => !v); setRicercaTab(''); }}>
            {mostraPassati ? '← Torna ai prossimi' : 'Viaggi passati'}
          </button>
        }
      />

      {erroreEventi ? (
        <p className="avviso avviso-errore" role="alert">Eventi non caricati: {erroreEventi}</p>
      ) : eventiConPren.length === 0 ? (
        <p className="testo-intro">Nessun evento ha ancora prenotazioni.</p>
      ) : eventiPerData.length === 0 ? (
        <p className="testo-intro">{mostraPassati ? 'Nessun evento passato con prenotazioni.' : 'Nessun evento futuro con prenotazioni.'}</p>
      ) : (
        <>
          {eventiPerData.length > 6 && (
            <div className="home-search-box" style={{ maxWidth: 480, margin: '0 0 20px' }}>
              <input
                placeholder="Cerca tra gli eventi con prenotazioni…"
                value={ricercaTab}
                onChange={(e) => setRicercaTab(e.target.value)}
                style={{ fontSize: 'var(--testo-lg)', textAlign: 'left', padding: '10px 4px' }}
              />
            </div>
          )}

          <div className="cards-list">
            {tabFiltrate.map((ev) => (
              <EventoCardCompatta
                key={ev.id}
                evento={{ ...ev, immagineUrl: ev.immagine }}
                onClick={() => { setEventoAttivoId(ev.id); setSottoTab('CONFERMATA'); setRicercaPrenotazioni(''); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
