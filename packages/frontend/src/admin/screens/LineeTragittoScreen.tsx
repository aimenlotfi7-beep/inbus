import { useEffect, useState } from 'react';
import { eventiApi, type Linea, type BusDiLineaInput, type CalcoloBusTragitto } from '../../api/eventi';
import type { Evento, Fermata } from '../../api/types';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
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
 *  Una "Linea" è un CONTENITORE: un percorso (quali fermate copre, in
 *  che ordine — cronologico, non di inserimento) che può avere UNO O
 *  PIÙ bus dentro — quando un primo bus non basta più per le stesse
 *  fermate, se ne aggiunge un secondo alla STESSA Linea invece di
 *  crearne una nuova. */
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
  const [lineaAttivaId, setLineaAttivaId] = useState<string | null>(null);

  // Popup "+ Aggiungi linea" — 2 step: anagrafica bus, poi percorso.
  const [popupAperto, setPopupAperto] = useState(false);
  const [stepPopup, setStepPopup] = useState<1 | 2>(1);
  const [formBus, setFormBus] = useState<BusDiLineaInput & { postiBus?: number }>(BUS_VUOTO);
  const [fermateSelezionate, setFermateSelezionate] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Modifica di una Linea già esistente.
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
      .then(([ev, c, l]) => {
        setEvento(ev); setCalcolo(c); setLinee(l);
        setLineaAttivaId((prec) => prec && l.some((x) => x.id === prec) ? prec : (l[0]?.id ?? null));
      })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la pagina.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    tourLeaderApi.list().then(setTourLeaders).catch(() => setTourLeaders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId, tragittoId]);

  function tornaAPartenze(tabDestinazione?: 'fermate' | 'da-prezzare' | 'da-confermare') {
    // Cambio di sezione interno — non più una navigazione vera del
    // browser. "evento"/"tragitto" vanno tolti esplicitamente
    // dall'indirizzo (prima un ricaricamento completo li avrebbe
    // "ripuliti" da solo insieme a tutto il resto — qui no, restano se
    // non li tolgo apposta). "Orari"/"Prezzo" vivono nella sezione
    // "Preventivi" (separata da "Partenze") — instrado verso quella,
    // non più sempre verso "Partenze" come prima della divisione.
    if (tabDestinazione === 'fermate' || tabDestinazione === 'da-prezzare') {
      navigaSezione('preventivi', { evento: null, tragitto: null, preventiviTab: tabDestinazione });
    } else {
      navigaSezione('partenze', { evento: null, tragitto: null, partenzeTab: tabDestinazione ?? null });
    }
  }

  if (!eventoId || !tragittoId) {
    return (
      <div>
        <PanelHead titolo="Linee" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Manca il riferimento all'evento o al tragitto — torna a Partenze e riprova.</p>
        <button className="btn btn-ghost" onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
      </div>
    );
  }
  if (caricamento) return <p className="testo-intro">Caricamento...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;
  if (!evento) return null;

  // Da qui in poi sono sicuramente valorizzati — TypeScript non lo
  // deduce da solo dentro le funzioni più sotto (chiusure catturano il
  // tipo originale, non ristretto).
  const idEvento = eventoId;
  const idTragitto = tragittoId;

  const tragittoVero = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === idTragitto);
  if (!tragittoVero) {
    return (
      <div>
        <PanelHead titolo="Linee" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Questo tragitto non esiste più, o è stato eliminato.</p>
        <button className="btn btn-ghost" onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
      </div>
    );
  }
  const fermateAttive = tragittoVero.fermate.filter((f: Fermata) => f.attivo);
  const calcoloTragitto = calcolo.find((c) => c.tragittoId === tragittoId);
  const partecipantiPerFermata = new Map(calcoloTragitto?.fermate.map((f) => [f.fermataId, f.passeggeri]) ?? []);

  // Ordina per orario — usata sia per il riepilogo in alto sia per
  // ordinare le fermate scelte nel popup (l'admin le clicca in
  // qualsiasi ordine, l'ordine finale lo decide sempre l'orario).
  function perOrario(a: Fermata, b: Fermata) {
    if (!a.orario && !b.orario) return 0;
    if (!a.orario) return 1;
    if (!b.orario) return -1;
    return a.orario.localeCompare(b.orario);
  }
  // Per il riepilogo in cima, a differenza di fermateAttive (che resta
  // filtrata solo su quelle attive — le uniche selezionabili quando si
  // costruisce una Linea, non toccare quella): qui servono TUTTE le
  // fermate, comprese quelle già escluse, per poterle riattivare da
  // qui se serve.
  const tutteLeFermateOrdinate = [...tragittoVero.fermate].sort(perOrario);
  // Aggiorna solo il flag attivo di UNA fermata, lasciando tutte le
  // altre invariate — stessa funzione già usata da Eventi per salvare
  // le fermate operative di un tragitto (aggiornaTragittoOperativo),
  // qui costruita per un solo campo alla volta invece di un modulo
  // intero.
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
    } catch (e) {
      alert(e instanceof ErroreApi ? `Non riuscito: ${e.message}` : 'Non riuscito: errore di rete.');
    }
  }

  // Riepilogo in cima — "in attesa" è lo stesso ovunque (è quante
  // prenotazioni non hanno ancora nessun bus, non dipende da QUALE
  // Linea guardi), "versate" invece è la SOMMA su tutte le Linee che
  // coprono quella città (ognuna versa sui propri bus). Se nessuna
  // Linea copre ancora quella città, tutto è "in attesa" — il totale
  // grezzo di prima, che è comunque quello giusto in quel caso.
  function contatoriCitta(f: Fermata) {
    const versati = linee.reduce((tot, l) => tot + (l.fermate.find((lf) => lf.citta === f.citta)?.versati ?? 0), 0);
    const primaLineaConQuestaCitta = linee.find((l) => l.fermate.some((lf) => lf.citta === f.citta));
    const inAttesa = primaLineaConQuestaCitta
      ? primaLineaConQuestaCitta.fermate.find((lf) => lf.citta === f.citta)!.inAttesa
      : partecipantiPerFermata.get(f.id) ?? 0;
    return { inAttesa, versati };
  }

  function apriPopupNuovaLinea() {
    setFormBus(BUS_VUOTO);
    setFermateSelezionate([]);
    setStepPopup(1);
    setPopupAperto(true);
  }

  async function salvaNuovaLinea() {
    if (!formBus.riferimento || !formBus.postiBus) {
      alert('Indica un riferimento per il bus e quanti posti ha.');
      return;
    }
    if (fermateSelezionate.length === 0) {
      alert('Seleziona almeno una fermata per la Linea.');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.creaLinea(idEvento, { ...formBus, postiBus: formBus.postiBus, fermateIds: fermateSelezionate });
      setPopupAperto(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  const lineaAttiva = linee.find((l) => l.id === lineaAttivaId);

  function apriModificaBus(busId: string) {
    const bus = lineaAttiva?.bus.find((b) => b.id === busId);
    if (!bus) return;
    setFormNuovoBus({
      riferimento: bus.riferimento, fornitoreId: bus.fornitoreId ?? undefined, autistaNome: bus.autistaNome ?? undefined,
      autistaTelefono: bus.autistaTelefono ?? undefined, tourLeaderId: bus.tourLeaderId, costo: bus.costo ? Number(bus.costo) : undefined,
      postiBus: bus.postiBus ?? undefined, note: bus.note ?? undefined,
    });
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
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  function apriAggiungiBus() {
    setFormNuovoBus(BUS_VUOTO);
    setAggiungiBusAperto(true);
  }
  async function salvaBusAggiunto() {
    if (!lineaAttivaId || !formNuovoBus.riferimento || !formNuovoBus.postiBus) {
      alert('Indica un riferimento e quanti posti ha il bus.');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.aggiungiBusALinea(lineaAttivaId, { ...formNuovoBus, postiBus: formNuovoBus.postiBus });
      setAggiungiBusAperto(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  async function versa() {
    if (!lineaAttivaId) return;
    setVersando(true);
    try {
      const { versate, restanoInAttesa } = await eventiApi.versaLinea(lineaAttivaId);
      ricarica();
      if (versate === 0 && restanoInAttesa > 0) alert('Nessun posto libero sui bus di questa Linea — aggiungine un altro, o aumenta i posti di quello che c\'è.');
      else if (restanoInAttesa > 0) alert(`Versate ${versate} prenotazion${versate === 1 ? 'e' : 'i'} — ${restanoInAttesa} restano in attesa, non c'è più posto sui bus di questa Linea.`);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Versamento non riuscito: ${e.message}` : 'Versamento non riuscito: errore di rete.');
    } finally {
      setVersando(false);
    }
  }

  function apriModificaPercorso() {
    if (!lineaAttiva) return;
    setPercorsoModificato(lineaAttiva.fermate.map((f) => f.fermataId));
    setModificaPercorsoAperta(true);
  }
  async function salvaModificaPercorso() {
    if (!lineaAttivaId || percorsoModificato.length === 0) {
      alert('Seleziona almeno una fermata.');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.aggiornaPercorsoLinea(idEvento, lineaAttivaId, percorsoModificato);
      setModificaPercorsoAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => tornaAPartenze()}>← Torna a Partenze</button>

      {/* Stesso indicatore di Partenze, con lo stesso sblocco
          progressivo — qui si arriva sempre dal contesto "Da
          confermare" (unico che porta a questa pagina), quindi è
          sempre quella evidenziata. "Confermato"/"Passate" restano
          solo visive (nessun editor dove atterrare da lì). */}
      {(() => {
        const ETICHETTE_CONTESTO: Record<string, string> = {
          fermate: 'Orari', 'da-prezzare': 'Prezzo', 'da-confermare': 'Linee Bus', confermato: 'Confermato', passate: 'Passate',
        };
        const fermateCompilate = tragittoVero.fermate.some((f) => f.orario);
        const preventivoCompilato = !!tragittoVero.preventivoCosto;
        const SBLOCCO: Record<string, boolean> = {
          fermate: true,
          'da-prezzare': fermateCompilate,
          'da-confermare': fermateCompilate && preventivoCompilato,
          confermato: true, // già ci sei: questa pagina Linee esiste solo perché la Linea è in corso di costruzione qui
          passate: true,
        };
        return (
          <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            {(['fermate', 'da-prezzare', 'da-confermare', 'confermato', 'passate'] as const).map((t) => {
              const navigabile = t === 'fermate' || t === 'da-prezzare' || t === 'da-confermare';
              const cliccabile = navigabile && SBLOCCO[t] && t !== 'da-confermare';
              return (
                <button
                  key={t}
                  type="button"
                  className={`mini-tab${t === 'da-confermare' ? ' active' : ''}`}
                  style={{ cursor: cliccabile ? 'pointer' : 'default', opacity: navigabile && !SBLOCCO[t] ? 0.5 : 1 }}
                  disabled={!cliccabile}
                  onClick={cliccabile ? () => tornaAPartenze(t as 'fermate' | 'da-prezzare' | 'da-confermare') : undefined}
                >
                  {ETICHETTE_CONTESTO[t]}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* 1. RIEPILOGO PARTENZA */}
      <PanelHead titolo={tragittoVero.nome} info={evento.artista} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {tutteLeFermateOrdinate.map((f) => {
          // Una fermata esclusa (es. per scarse adesioni) non ha senso
          // mostrarla coi contatori prenotazioni — non è più
          // selezionabile per nessuna Linea, resta solo un promemoria
          // sfumato con un modo per riattivarla se serve.
          if (!f.attivo) {
            return (
              <span key={f.id} className="chip" style={{ opacity: 0.55 }}>
                <span style={{ textDecoration: 'line-through' }}>{f.citta}</span>
                <button type="button" onClick={() => alternaFermataAttiva(f.id)} title="Riattiva questa fermata" style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: 0, fontSize: 13 }}>↺</button>
              </span>
            );
          }
          const { inAttesa, versati } = contatoriCitta(f);
          return (
            <span key={f.id} className="chip">
              {f.citta}
              <span style={{ color: 'var(--pink)', fontFamily: "'Space Mono',monospace" }}>{inAttesa}</span>
              <span style={{ color: 'var(--mist)' }}>/</span>
              <span style={{ color: 'var(--green)', fontFamily: "'Space Mono',monospace" }}>{versati}</span>
              <button type="button" onClick={() => alternaFermataAttiva(f.id)} title="Escludi questa fermata (es. per scarse adesioni) — resta nel tragitto, solo non più selezionabile per una Linea" style={{ background: 'none', border: 'none', color: 'var(--mist)', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
            </span>
          );
        })}
        {tutteLeFermateOrdinate.length === 0 && <span style={{ color: 'var(--mist)' }}>Nessuna fermata su questo tragitto.</span>}
      </div>

      {/* 2. LINEE / BUS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="section-label" style={{ marginBottom: 0 }}>Linee</p>
        <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={apriPopupNuovaLinea}>+ Aggiungi linea</button>
      </div>

      {linee.length === 0 ? (
        <p className="testo-intro">Nessuna Linea ancora per questo tragitto.</p>
      ) : (
        <>
          {/* Tab orizzontali, una per Linea */}
          <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            {linee.map((l) => (
              <button key={l.id} type="button" className={`mini-tab${lineaAttivaId === l.id ? ' active' : ''}`} onClick={() => setLineaAttivaId(l.id)}>
                {l.nome}
              </button>
            ))}
          </div>

          {lineaAttiva && (
            <div className="section-card">
              {/* Riepilogo immediato della Linea selezionata */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {lineaAttiva.fermate.map((f) => (
                  <span key={f.fermataId} className="chip">
                    {f.citta}{f.orario && <span style={{ color: 'var(--mist)', fontSize: 11.5 }}>({f.orario})</span>}
                    <span style={{ color: 'var(--pink)', fontFamily: "'Space Mono',monospace" }}>{f.inAttesa}</span>
                    <span style={{ color: 'var(--mist)' }}>/</span>
                    <span style={{ color: 'var(--green)', fontFamily: "'Space Mono',monospace" }}>{f.versati}</span>
                  </span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 16 }}>
                {lineaAttiva.bus.length} bus associat{lineaAttiva.bus.length === 1 ? 'o' : 'i'} a questa Linea
              </p>

              <button className="btn btn-primary" style={{ fontSize: 12.5, marginBottom: 12 }} onClick={versa} disabled={versando}>
                {versando ? 'Verso...' : '↓ Versa le prenotazioni in attesa su questa Linea'}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 12, marginLeft: 8 }} onClick={apriModificaPercorso}>Modifica percorso</button>

              {lineaAttiva.bus.map((b) => (
                <div key={b.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                  <span className="riga-titolo">
                    {b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}
                    {b.tourLeaderNome && <><br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>Tour leader: {b.tourLeaderNome}</span></>}
                    <br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{b.postiBus ?? '—'} posti</span>
                  </span>
                  <span className="riga-meta">
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => apriModificaBus(b.id)}>Modifica</button>
                  </span>
                </div>
              ))}

              <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 12 }} onClick={apriAggiungiBus}>+ Aggiungi un altro bus a questa Linea</button>
            </div>
          )}
        </>
      )}

      {/* Popup nuova Linea, a 2 step */}
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
                    if (!formBus.riferimento || !formBus.postiBus) { alert('Indica un riferimento e i posti del bus.'); return; }
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

      {/* Modifica di un bus già dentro la Linea */}
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

      {/* Aggiungi un altro bus alla Linea attiva */}
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

      {/* Modifica del percorso della Linea attiva */}
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
