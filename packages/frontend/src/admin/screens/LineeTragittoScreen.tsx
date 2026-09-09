import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { eventiApi, type Linea, type BusDiLineaInput, type CalcoloBusTragitto } from '../../api/eventi';
import type { Evento, Fermata } from '../../api/types';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { preventiviApi } from '../../api/preventivi';
import { tourLeaderApi, type TourLeader } from '../../api/tourleader';
import { ErroreApi } from '../../api/client';
import { CampoNumero } from '../shared/CampoNumero';
import { PanelHead } from '../shared/PanelHead';
import { useNavigazione } from '../shared/NavigazioneContext';

const BUS_VUOTO: BusDiLineaInput = { riferimento: '' };

/** Pagina dedicata a UN tragitto — un vero indirizzo a sé
 *  (?sezione=linee&evento=...&tragitto=...), raggiunto dal pulsante
 *  "Gestisci Linee" in Partenze.
 *
 *  Risponde a tre domande, e solo quelle (niente incassi/margini qui,
 *  quelli vivono nelle sezioni economiche di Partenze):
 *  1. Quante fermate ha questo tragitto?
 *  2. Quante prenotazioni ci sono per ognuna?
 *  3. Quali Linee lo percorrono, e quali bus sono censiti su ciascuna?
 *
 *  Una "Linea" è un CONTENITORE: un percorso (quali fermate copre, in
 *  che ordine — cronologico, non di inserimento) che può avere UNO O
 *  PIÙ bus dentro — quando un primo bus non basta più per le stesse
 *  fermate, se ne aggiunge un secondo alla STESSA Linea invece di
 *  crearne una nuova. Linee diverse dello stesso tragitto NON devono
 *  avere per forza le stesse fermate (già supportato dal modello dati
 *  — linea_fermate collega una linea a un SUO sottoinsieme). */
export function LineeTragittoScreen() {
  const navigaSezione = useNavigazione();
  const parametri = new URLSearchParams(window.location.search);
  const eventoId = parametri.get('evento');
  const tragittoId = parametri.get('tragitto');

  const [evento, setEvento] = useState<Evento | null>(null);
  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [linee, setLinee] = useState<Linea[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  const [tab, setTab] = useState<'fermate' | 'linee'>('linee');
  const [gestisciFermateAperto, setGestisciFermateAperto] = useState(false);
  const [lineeEspanse, setLineeEspanse] = useState<Set<string>>(new Set());
  const [lineaAttivaId, setLineaAttivaId] = useState<string | null>(null);

  const [popupAperto, setPopupAperto] = useState(false);
  const [stepPopup, setStepPopup] = useState<1 | 2>(1);
  const [formBus, setFormBus] = useState<BusDiLineaInput & { postiBus?: number }>(BUS_VUOTO);
  const [fermateSelezionate, setFermateSelezionate] = useState<string[]>([]);
  const [verificaKm, setVerificaKm] = useState<{ kmAccettati: number | null; kmAttuali: number | null; cambiatoParecchio: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [modificaBusId, setModificaBusId] = useState<string | null>(null);
  const [modificaPercorsoAperta, setModificaPercorsoAperta] = useState(false);
  const [percorsoModificato, setPercorsoModificato] = useState<string[]>([]);
  const [aggiungiBusAperto, setAggiungiBusAperto] = useState(false);
  const [versando, setVersando] = useState(false);
  const [formNuovoBus, setFormNuovoBus] = useState<BusDiLineaInput & { postiBus?: number }>(BUS_VUOTO);

  function ricarica() {
    if (!eventoId || !tragittoId) return;
    setCaricamento(true);
    setErrore('');
    Promise.all([eventiApi.getById(eventoId), eventiApi.calcolaBus(eventoId), eventiApi.listaLinee(tragittoId)])
      .then(([ev, c, l]) => { setEvento(ev); setCalcolo(c); setLinee(l); })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la pagina.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    tourLeaderApi.list().then(setTourLeaders).catch(() => setTourLeaders([]));
    if (tragittoId) preventiviApi.verificaKm(tragittoId).then(setVerificaKm).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId, tragittoId]);

  function tornaAPartenze(tabDestinazione?: 'fermate' | 'preventivi' | 'da-prezzare' | 'da-confermare') {
    const sezione = tabDestinazione === 'fermate' ? 'partenze-orari'
      : tabDestinazione === 'preventivi' ? 'partenze-preventivi'
      : tabDestinazione === 'da-prezzare' ? 'partenze-prezzi'
      : 'partenze-da-confermare';
    navigaSezione(sezione, { evento: null, tragitto: null });
  }

  if (!eventoId || !tragittoId) {
    return (
      <div>
        <PanelHead titolo="Tragitto" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Manca il riferimento all'evento o al tragitto — torna a Partenze e riprova.</p>
        <button className="btn btn-ghost" onClick={() => tornaAPartenze()}>← Torna alle partenze</button>
      </div>
    );
  }
  if (caricamento) return <p className="testo-intro">Caricamento...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;
  if (!evento) return null;

  const idEvento = eventoId;
  const idTragitto = tragittoId;

  const tragittoVero = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === idTragitto);
  if (!tragittoVero) {
    return (
      <div>
        <PanelHead titolo="Tragitto" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Questo tragitto non esiste più, o è stato eliminato.</p>
        <button className="btn btn-ghost" onClick={() => tornaAPartenze()}>← Torna alle partenze</button>
      </div>
    );
  }
  const fermateAttive = tragittoVero.fermate.filter((f: Fermata) => f.attivo);
  const calcoloTragitto = calcolo.find((c) => c.tragittoId === tragittoId);
  const partecipantiPerFermata = new Map(calcoloTragitto?.fermate.map((f) => [f.fermataId, f.passeggeri]) ?? []);

  function perOrario(a: Fermata, b: Fermata) {
    if (!a.orario && !b.orario) return 0;
    if (!a.orario) return 1;
    if (!b.orario) return -1;
    return a.orario.localeCompare(b.orario);
  }
  const tutteLeFermateOrdinate = [...tragittoVero.fermate].sort(perOrario);

  async function alternaFermataAttiva(fermataId: string) {
    const t = tragittoVero;
    if (!t) return;
    const fermateAggiornate = t.fermate.map((f) => ({
      fermataAnagraficaId: f.fermataAnagraficaId, citta: f.citta, indirizzo: f.indirizzo ?? undefined,
      orario: f.orario ?? undefined, orarioRitorno: f.orarioRitorno ?? undefined, indirizzoRitorno: f.indirizzoRitorno ?? undefined,
      prezzo: f.prezzo ? Number(f.prezzo) : undefined, postiMax: f.postiMax ?? undefined,
      sogliaMinima: f.sogliaMinima ?? undefined,
      attivo: f.id === fermataId ? !f.attivo : f.attivo,
    }));
    try {
      await eventiApi.aggiornaTragittoOperativo(idTragitto, { fermate: fermateAggiornate });
      ricarica();
      preventiviApi.verificaKm(idTragitto).then(setVerificaKm).catch(() => {});
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Non riuscito: ${e.message}` : 'Non riuscito: errore di rete.');
    }
  }

  function contatoriCitta(f: Fermata) {
    const versati = linee.reduce((tot, l) => tot + (l.fermate.find((lf) => lf.citta === f.citta)?.versati ?? 0), 0);
    const primaLineaConQuestaCitta = linee.find((l) => l.fermate.some((lf) => lf.citta === f.citta));
    const inAttesa = primaLineaConQuestaCitta
      ? primaLineaConQuestaCitta.fermate.find((lf) => lf.citta === f.citta)!.inAttesa
      : partecipantiPerFermata.get(f.id) ?? 0;
    return { inAttesa, versati };
  }

  function prenotazioniLinea(l: Linea): number {
    return l.fermate.reduce((tot, f) => tot + f.inAttesa + f.versati, 0);
  }

  function apriPopupNuovaLinea() {
    setFormBus(BUS_VUOTO);
    setFermateSelezionate([]);
    setStepPopup(1);
    setPopupAperto(true);
  }

  async function salvaNuovaLinea() {
    if (!formBus.riferimento || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.');
      return;
    }
    if (fermateSelezionate.length === 0) {
      notifica('Seleziona almeno una fermata per la Linea.');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.creaLinea(idEvento, { ...formBus, postiBus: formBus.postiBus, fermateIds: fermateSelezionate });
      setPopupAperto(false);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  const lineaAttiva = linee.find((l) => l.id === lineaAttivaId);

  function apriModificaBus(lineaId: string, busId: string) {
    const linea = linee.find((l) => l.id === lineaId);
    const bus = linea?.bus.find((b) => b.id === busId);
    if (!bus) return;
    setFormNuovoBus({
      riferimento: bus.riferimento, fornitoreId: bus.fornitoreId ?? undefined, autistaNome: bus.autistaNome ?? undefined,
      autistaTelefono: bus.autistaTelefono ?? undefined, tourLeaderId: bus.tourLeaderId, costo: bus.costo ? Number(bus.costo) : undefined,
      postiBus: bus.postiBus ?? undefined, note: bus.note ?? undefined,
    });
    setLineaAttivaId(lineaId);
    setModificaBusId(busId);
  }

  async function salvaModificaBus() {
    if (!modificaBusId) return;
    setSalvando(true);
    try {
      await eventiApi.aggiornaBusDiLinea(modificaBusId, formNuovoBus);
      setModificaBusId(null);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  function apriAggiungiBus(lineaId: string) {
    setFormNuovoBus(BUS_VUOTO);
    setLineaAttivaId(lineaId);
    setAggiungiBusAperto(true);
  }
  async function salvaBusAggiunto() {
    if (!lineaAttivaId || !formNuovoBus.riferimento || !formNuovoBus.postiBus) {
      notifica('Indica un riferimento e quanti posti ha il bus.');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.aggiungiBusALinea(lineaAttivaId, { ...formNuovoBus, postiBus: formNuovoBus.postiBus });
      setAggiungiBusAperto(false);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  async function versa(lineaId: string) {
    setVersando(true);
    try {
      const { versate, restanoInAttesa } = await eventiApi.versaLinea(lineaId);
      ricarica();
      if (versate === 0 && restanoInAttesa > 0) notifica('Nessun posto libero sui bus di questa Linea — aggiungine un altro, o aumenta i posti di quello che c\'è.');
      else if (restanoInAttesa > 0) notifica(`Versate ${versate} prenotazion${versate === 1 ? 'e' : 'i'} — ${restanoInAttesa} restano in attesa, non c'è più posto sui bus di questa Linea.`);
      else notifica(`Versate ${versate} prenotazion${versate === 1 ? 'e' : 'i'}.`, 'successo');
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Versamento non riuscito: ${e.message}` : 'Versamento non riuscito: errore di rete.');
    } finally {
      setVersando(false);
    }
  }

  function apriModificaPercorso(lineaId: string) {
    const linea = linee.find((l) => l.id === lineaId);
    if (!linea) return;
    setLineaAttivaId(lineaId);
    setPercorsoModificato(linea.fermate.map((f) => f.fermataId));
    setModificaPercorsoAperta(true);
  }
  async function salvaModificaPercorso() {
    if (!lineaAttivaId || percorsoModificato.length === 0) {
      notifica('Seleziona almeno una fermata.');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.aggiornaPercorsoLinea(idEvento, lineaAttivaId, percorsoModificato);
      setModificaPercorsoAperta(false);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  function alternaLineaEspansa(lineaId: string) {
    setLineeEspanse((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(lineaId)) nuovo.delete(lineaId); else nuovo.add(lineaId);
      return nuovo;
    });
  }

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => tornaAPartenze()}>← Torna alle partenze</button>

      <PanelHead
        titolo={tragittoVero.nome}
        azione={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setTab('fermate'); setGestisciFermateAperto(true); }}>Gestisci fermate</button>
            <button className="btn btn-primary" onClick={apriPopupNuovaLinea}>+ Nuova linea</button>
          </div>
        }
      />
      <p className="testo-intro" style={{ marginTop: -8, marginBottom: 16 }}>
        {evento.artista} · {fermateAttive.length} fermat{fermateAttive.length === 1 ? 'a' : 'e'} · {linee.length} line{linee.length === 1 ? 'a' : 'e'}
      </p>

      {verificaKm?.cambiatoParecchio && (
        <div style={{ background: 'var(--dusk)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span><b style={{ color: 'var(--amber)' }}>⚠ Le fermate sono cambiate parecchio</b> da quando hai accettato il preventivo (~{Math.round(verificaKm.kmAccettati!)} km allora, ~{Math.round(verificaKm.kmAttuali!)} km ora) — potrebbe servire un nuovo preventivo.</span>
          <button type="button" className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => tornaAPartenze('preventivi')}>Vai a Preventivi →</button>
        </div>
      )}

      <div className="mini-tabs" style={{ marginBottom: 20 }}>
        <button type="button" className={`mini-tab${tab === 'fermate' ? ' active' : ''}`} onClick={() => setTab('fermate')}>Fermate ({fermateAttive.length})</button>
        <button type="button" className={`mini-tab${tab === 'linee' ? ' active' : ''}`} onClick={() => setTab('linee')}>Linee ({linee.length})</button>
      </div>

      {tab === 'fermate' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p className="section-label" style={{ marginBottom: 0 }}>Prenotazioni per fermata</p>
            {!gestisciFermateAperto && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setGestisciFermateAperto(true)}>Gestisci fermate</button>
            )}
          </div>

          {!gestisciFermateAperto ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {fermateAttive.length === 0 && <p className="testo-intro">Nessuna fermata attiva su questo tragitto.</p>}
              {fermateAttive.sort(perOrario).map((f) => {
                const { inAttesa, versati } = contatoriCitta(f);
                return (
                  <div key={f.id} className="section-card" style={{ padding: 14 }}>
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>{f.citta}</p>
                    <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 22, fontWeight: 700 }}>{inAttesa + versati}</p>
                    {inAttesa > 0 && <p style={{ fontSize: 11.5, color: 'var(--pink)' }}>{inAttesa} in attesa di un bus</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="section-card">
              <p className="testo-intro" style={{ marginTop: -4, marginBottom: 12 }}>
                Escludi una fermata (es. per scarse adesioni) — resta nel tragitto, solo non più selezionabile per una nuova Linea. Le fermate già dentro una Linea non vengono toccate.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {tutteLeFermateOrdinate.map((f) => {
                  if (!f.attivo) {
                    return (
                      <span key={f.id} className="chip" style={{ opacity: 0.55 }}>
                        <span style={{ textDecoration: 'line-through' }}>{f.citta}</span>
                        <button type="button" onClick={() => alternaFermataAttiva(f.id)} title="Riattiva questa fermata" style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: 0, fontSize: 13 }}>↺</button>
                      </span>
                    );
                  }
                  return (
                    <span key={f.id} className="chip">
                      {f.citta}
                      <button type="button" onClick={() => alternaFermataAttiva(f.id)} title="Escludi questa fermata" style={{ background: 'none', border: 'none', color: 'var(--mist)', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
                    </span>
                  );
                })}
                {tutteLeFermateOrdinate.length === 0 && <span style={{ color: 'var(--mist)' }}>Nessuna fermata su questo tragitto.</span>}
              </div>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setGestisciFermateAperto(false)}>← Torna alla vista normale</button>
            </div>
          )}
        </div>
      )}

      {tab === 'linee' && (
        <div>
          <p className="section-label" style={{ marginBottom: 12 }}>Linee su questo tragitto</p>

          {linee.length === 0 ? (
            <p className="testo-intro">Nessuna Linea ancora per questo tragitto — crea la prima con "+ Nuova linea" qui sopra.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {linee.map((l) => {
                const espansa = lineeEspanse.has(l.id);
                const percorso = l.fermate.map((f) => f.citta).join(' → ');
                return (
                  <div key={l.id} className="section-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }} onClick={() => alternaLineaEspansa(l.id)}>
                      <div>
                        <p style={{ fontWeight: 700, marginBottom: 4 }}>{l.nome}</p>
                        <p style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 8 }}>{percorso || 'Nessuna fermata'}</p>
                        <p style={{ fontSize: 12.5 }}>
                          Prenotazioni: <b>{prenotazioniLinea(l)}</b>
                          <span style={{ color: 'var(--mist)' }}> · </span>
                          Bus censiti: <b>{l.bus.length}</b>
                        </p>
                      </div>
                      <span style={{ color: 'var(--mist)', fontSize: 18, flexShrink: 0 }}>{espansa ? '▲' : '▼'}</span>
                    </div>

                    {espansa && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                          {l.fermate.map((f) => (
                            <span key={f.fermataId} className="chip">
                              {f.citta}{f.orario && <span style={{ color: 'var(--mist)', fontSize: 11.5 }}>({f.orario})</span>}
                              <span style={{ color: 'var(--pink)', fontFamily: "'Space Mono',monospace" }}>{f.inAttesa}</span>
                              <span style={{ color: 'var(--mist)' }}>/</span>
                              <span style={{ color: 'var(--green)', fontFamily: "'Space Mono',monospace" }}>{f.versati}</span>
                            </span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                          <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => versa(l.id)} disabled={versando}>
                            {versando && lineaAttivaId === l.id ? 'Verso...' : '↓ Versa le prenotazioni in attesa'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => apriModificaPercorso(l.id)}>Modifica percorso</button>
                        </div>

                        <p className="section-label" style={{ fontSize: 12, marginBottom: 8 }}>Bus su questa linea</p>
                        {l.bus.length === 0 ? (
                          <div>
                            <p className="testo-intro" style={{ marginBottom: 10 }}>Nessun bus censito.</p>
                            <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => apriAggiungiBus(l.id)}>+ Censisci bus</button>
                          </div>
                        ) : (
                          <>
                            {l.bus.map((b) => (
                              <div key={b.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                                <span className="riga-titolo">
                                  {b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}
                                  {b.tourLeaderNome && <><br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>Tour leader: {b.tourLeaderNome}</span></>}
                                  <br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{b.postiBus ?? '—'} posti</span>
                                </span>
                                <span className="riga-meta">
                                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => apriModificaBus(l.id, b.id)}>Modifica</button>
                                </span>
                              </div>
                            ))}
                            <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 12 }} onClick={() => apriAggiungiBus(l.id)}>+ Aggiungi un altro bus a questa Linea</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {popupAperto && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Nuova Linea — passo {stepPopup} di 2</p>

          {stepPopup === 1 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>Anagrafica bus</p>
              <div className="campo"><label>Riferimento (es. targa, o codice dell'agenzia)</label><input value={formBus.riferimento} onChange={(e) => setFormBus({ ...formBus, riferimento: e.target.value })} /></div>
              <div className="campo">
                <label>Fornitore</label>
                <select value={formBus.fornitoreId ?? ''} onChange={(e) => setFormBus({ ...formBus, fornitoreId: e.target.value || undefined })}>
                  <option value="">— Nessuno —</option>
                  {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div className="campo"><label>Autista (facoltativo)</label><input value={formBus.autistaNome ?? ''} onChange={(e) => setFormBus({ ...formBus, autistaNome: e.target.value })} /></div>
              <div className="campo"><label>Telefono autista (facoltativo)</label><input value={formBus.autistaTelefono ?? ''} onChange={(e) => setFormBus({ ...formBus, autistaTelefono: e.target.value })} /></div>
              <div className="campo">
                <label>Tour leader assegnato</label>
                <select value={formBus.tourLeaderId ?? ''} onChange={(e) => setFormBus({ ...formBus, tourLeaderId: e.target.value || null })}>
                  <option value="">— Nessuno —</option>
                  {tourLeaders.map((t) => <option key={t.id} value={t.id}>{t.nome} {t.cognome}</option>)}
                </select>
              </div>
              <div className="campo"><label>Posti del bus</label><CampoNumero min={0} value={formBus.postiBus} onChange={(v) => setFormBus({ ...formBus, postiBus: v })} /></div>
              <div className="campo"><label>Costo del bus (facoltativo)</label><CampoNumero valuta min={0} value={formBus.costo} onChange={(v) => setFormBus({ ...formBus, costo: v })} /></div>
              <div className="campo"><label>Note</label><input value={formBus.note ?? ''} onChange={(e) => setFormBus({ ...formBus, note: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  className="btn btn-primary" style={{ flex: 1 }}
                  onClick={() => {
                    if (!formBus.riferimento || !formBus.postiBus) { notifica('Indica un riferimento e i posti del bus.'); return; }
                    setStepPopup(2);
                  }}
                >
                  Avanti — scegli le fermate
                </button>
                <button className="btn btn-ghost" onClick={() => setPopupAperto(false)}>Annulla</button>
              </div>
            </>
          )}

          {stepPopup === 2 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>
                Scegli le fermate — in QUALSIASI ordine (l'ordine finale lo decide da solo l'orario di ciascuna).
              </p>
              {fermateAttive.map((f) => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={fermateSelezionate.includes(f.id)}
                    onChange={(e) => setFermateSelezionate((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))}
                  />
                  {f.citta} {f.orario && <span style={{ color: 'var(--mist)', fontSize: 12 }}>({f.orario})</span>}
                </label>
              ))}
              {fermateSelezionate.length > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--mist)', marginTop: 10 }}>
                  Ordine finale: {[...fermateAttive].filter((f) => fermateSelezionate.includes(f.id)).sort(perOrario).map((f) => f.citta).join(' → ')}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setStepPopup(1)}>← Indietro</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvaNuovaLinea} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva Linea'}</button>
                <button className="btn btn-ghost" onClick={() => setPopupAperto(false)}>Annulla</button>
              </div>
            </>
          )}
        </div>
      )}

      {modificaBusId && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Modifica bus</p>
          <div className="campo"><label>Riferimento</label><input value={formNuovoBus.riferimento} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, riferimento: e.target.value })} /></div>
          <div className="campo">
            <label>Fornitore</label>
            <select value={formNuovoBus.fornitoreId ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, fornitoreId: e.target.value || undefined })}>
              <option value="">— Nessuno —</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="campo"><label>Autista</label><input value={formNuovoBus.autistaNome ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, autistaNome: e.target.value })} /></div>
          <div className="campo"><label>Telefono autista</label><input value={formNuovoBus.autistaTelefono ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, autistaTelefono: e.target.value })} /></div>
          <div className="campo">
            <label>Tour leader</label>
            <select value={formNuovoBus.tourLeaderId ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, tourLeaderId: e.target.value || null })}>
              <option value="">— Nessuno —</option>
              {tourLeaders.map((t) => <option key={t.id} value={t.id}>{t.nome} {t.cognome}</option>)}
            </select>
          </div>
          <div className="campo"><label>Posti del bus</label><CampoNumero min={0} value={formNuovoBus.postiBus} onChange={(v) => setFormNuovoBus({ ...formNuovoBus, postiBus: v })} /></div>
          <div className="campo"><label>Costo del bus</label><CampoNumero valuta min={0} value={formNuovoBus.costo} onChange={(v) => setFormNuovoBus({ ...formNuovoBus, costo: v })} /></div>
          <div className="campo"><label>Note</label><input value={formNuovoBus.note ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, note: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvaModificaBus} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva'}</button>
            <button className="btn btn-ghost" onClick={() => setModificaBusId(null)}>Annulla</button>
          </div>
        </div>
      )}

      {aggiungiBusAperto && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Aggiungi bus a "{lineaAttiva?.nome}"</p>
          <p className="testo-intro" style={{ marginTop: -6 }}>Stesse fermate della Linea — non si ridefiniscono qui.</p>
          <div className="campo"><label>Riferimento</label><input value={formNuovoBus.riferimento} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, riferimento: e.target.value })} /></div>
          <div className="campo">
            <label>Fornitore</label>
            <select value={formNuovoBus.fornitoreId ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, fornitoreId: e.target.value || undefined })}>
              <option value="">— Nessuno —</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="campo"><label>Autista</label><input value={formNuovoBus.autistaNome ?? ''} onChange={(e) => setFormNuovoBus({ ...formNuovoBus, autistaNome: e.target.value })} /></div>
          <div className="campo"><label>Posti del bus</label><CampoNumero min={0} value={formNuovoBus.postiBus} onChange={(v) => setFormNuovoBus({ ...formNuovoBus, postiBus: v })} /></div>
          <div className="campo"><label>Costo del bus</label><CampoNumero valuta min={0} value={formNuovoBus.costo} onChange={(v) => setFormNuovoBus({ ...formNuovoBus, costo: v })} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvaBusAggiunto} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva'}</button>
            <button className="btn btn-ghost" onClick={() => setAggiungiBusAperto(false)}>Annulla</button>
          </div>
        </div>
      )}

      {modificaPercorsoAperta && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Modifica percorso — cambia per tutti i bus di questa Linea</p>
          {fermateAttive.map((f) => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={percorsoModificato.includes(f.id)}
                onChange={(e) => setPercorsoModificato((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))}
              />
              {f.citta} {f.orario && <span style={{ color: 'var(--mist)', fontSize: 12 }}>({f.orario})</span>}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvaModificaPercorso} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva'}</button>
            <button className="btn btn-ghost" onClick={() => setModificaPercorsoAperta(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
