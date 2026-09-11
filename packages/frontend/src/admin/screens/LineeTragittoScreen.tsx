import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { conferma } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { eventiApi, type Linea, type BusDiLineaInput, type SuggerimentoLinea, type CalcoloBusTragitto } from '../../api/eventi';
import type { Evento, Fermata } from '../../api/types';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { preventiviApi } from '../../api/preventivi';
import { tourLeaderApi, type TourLeader } from '../../api/tourleader';
import { CampoNumero } from '../shared/CampoNumero';
import { PanelHead } from '../shared/PanelHead';
import { useNavigazione } from '../shared/NavigazioneContext';
import { formattaEuro, plurale } from '../../shared/formato';
import { confermaAvvisiClienti, notificaEsitoAvvisi } from '../shared/avvisiClienti';
import { SEZIONE_PARTENZE, type TabPartenze } from './partenze/tipi';

const BUS_VUOTO: BusDiLineaInput = { riferimento: '' };

/** Un pannello di modifica alla volta: prima "Modifica percorso" della
 *  Linea 1 e "Modifica" di un bus della Linea 2 potevano restare aperti
 *  insieme, condividendo la stessa linea attiva — e il percorso finiva
 *  salvato sulla linea sbagliata. */
type Pannello = 'nuova-linea' | 'modifica-bus' | 'aggiungi-bus' | 'modifica-percorso';

/** Pagina dedicata a UN tragitto — sia come pagina a sé
 *  (?sezione=linee&evento=...&tragitto=...&da=..., aperta da
 *  Confermate/Passate) sia INCORPORATA direttamente dentro "Da
 *  confermare" (props espliciti, niente lettura di URL, niente pulsante
 *  "torna indietro" — è già dentro la pagina giusta).
 *
 *  Risponde a tre domande, e solo quelle (niente incassi/margini qui,
 *  quelli vivono nelle sezioni economiche di Partenze):
 *  1. Quante fermate ha questo tragitto?
 *  2. Quante prenotazioni ci sono per ognuna?
 *  3. Quali linee lo percorrono, e quali bus sono assegnati a ciascuna?
 *
 *  Una "linea" è un CONTENITORE: un percorso (quali fermate copre, in
 *  che ordine — cronologico, non di inserimento) che può avere UNO O
 *  PIÙ bus dentro — quando un primo bus non basta più per le stesse
 *  fermate, se ne aggiunge un secondo alla STESSA linea invece di
 *  crearne una nuova. Linee diverse dello stesso tragitto NON devono
 *  avere per forza le stesse fermate (già supportato dal modello dati
 *  — linea_fermate collega una linea a un SUO sottoinsieme). */
export function LineeTragittoScreen(props?: { eventoIdProp?: string; tragittoIdProp?: string; incorporata?: boolean; onModificato?: () => void }) {
  const navigaSezione = useNavigazione();
  const parametri = new URLSearchParams(window.location.search);
  const eventoId = props?.eventoIdProp ?? parametri.get('evento');
  const tragittoId = props?.tragittoIdProp ?? parametri.get('tragitto');
  // Da quale voce di Partenze si è arrivati: "← Torna" deve riportare lì,
  // non sempre a "Da confermare".
  const origine = parametri.get('da') as TabPartenze | null;
  const incorporata = !!props?.incorporata;
  const onModificato = props?.onModificato;

  const [evento, setEvento] = useState<Evento | null>(null);
  const [linee, setLinee] = useState<Linea[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [erroreElenchi, setErroreElenchi] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [gestisciFermateAperto, setGestisciFermateAperto] = useState(false);
  const [fermataInSalvataggio, setFermataInSalvataggio] = useState<string | null>(null);
  const [lineeEspanse, setLineeEspanse] = useState<Set<string>>(new Set());

  const [pannello, setPannello] = useState<Pannello | null>(null);
  const [lineaAttivaId, setLineaAttivaId] = useState<string | null>(null);
  const [busInModificaId, setBusInModificaId] = useState<string | null>(null);
  const [stepNuovaLinea, setStepNuovaLinea] = useState<1 | 2>(1);
  const [formBus, setFormBus] = useState<BusDiLineaInput & { postiBus?: number }>(BUS_VUOTO);
  const [fermateSelezionate, setFermateSelezionate] = useState<string[]>([]);
  const [percorsoModificato, setPercorsoModificato] = useState<string[]>([]);
  const [verificaKm, setVerificaKm] = useState<{ kmAccettati: number | null; kmAttuali: number | null; cambiatoParecchio: boolean } | null>(null);
  const [suggerimento, setSuggerimento] = useState<SuggerimentoLinea | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [versandoLineaId, setVersandoLineaId] = useState<string | null>(null);

  function ricarica() {
    if (!eventoId || !tragittoId) return;
    setErrore('');
    Promise.all([eventiApi.getById(eventoId), eventiApi.calcolaBus(eventoId), eventiApi.listaLinee(tragittoId)])
      .then(([ev, c, l]) => { setEvento(ev); setCalcolo(c); setLinee(l); })
      .catch((e) => setErrore(`Impossibile caricare le linee: ${motivoErrore(e)}`))
      .finally(() => setCaricamento(false));
    // Anche il suggerimento — dopo aver creato/modificato una linea, i
    // suoi numeri (o "già confermata") potrebbero non valere più.
    eventiApi.suggerimentoLinea(tragittoId).then(setSuggerimento).catch(() => setSuggerimento(null));
  }
  /** Dopo ogni modifica: dati di questa pagina, e (se incorporata) la
   *  pagina che la contiene, così intestazione e card non restano indietro. */
  function aggiornaDopoModifica() {
    ricarica();
    onModificato?.();
  }
  useEffect(() => {
    ricarica();
    // Un elenco che non si carica non deve sembrare vuoto: con "— Nessuno —"
    // al posto del fornitore già assegnato si rischia di salvarlo cancellato.
    fornitoriApi.list().then(setFornitori).catch((e) => setErroreElenchi(`Elenco fornitori non disponibile: ${motivoErrore(e)}`));
    tourLeaderApi.list().then(setTourLeaders).catch((e) => setErroreElenchi(`Elenco tour leader non disponibile: ${motivoErrore(e)}`));
    if (tragittoId) preventiviApi.verificaKm(tragittoId).then(setVerificaKm).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId, tragittoId]);

  function tornaAPartenze(tabDestinazione?: TabPartenze) {
    navigaSezione(SEZIONE_PARTENZE[tabDestinazione ?? origine ?? 'da-confermare'] as never, { evento: null, tragitto: null, da: null, eventoId: null, tragittiIds: null });
  }

  if (!eventoId || !tragittoId) {
    return (
      <div>
        <PanelHead titolo="Linee del tragitto" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Manca il riferimento all'evento o al tragitto: torna a Partenze e riprova.</p>
        <button type="button" className="btn btn-ghost" onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
      </div>
    );
  }
  if (caricamento) return <p className="testo-intro">Carico…</p>;
  if (errore && !evento) {
    return (
      <div>
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>
        <button type="button" className="btn btn-ghost" onClick={ricarica}>Riprova</button>
      </div>
    );
  }
  if (!evento) return null;

  const idEvento = eventoId;
  const idTragitto = tragittoId;

  const tragittoVero = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === idTragitto);
  if (!tragittoVero) {
    return (
      <div>
        <PanelHead titolo="Linee del tragitto" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Questo tragitto non esiste più, o è stato eliminato.</p>
        <button type="button" className="btn btn-ghost" onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
      </div>
    );
  }
  const fermateAttive = tragittoVero.fermate.filter((f: Fermata) => f.attivo);

  function perOrario(a: Fermata, b: Fermata) {
    if (!a.orario && !b.orario) return 0;
    if (!a.orario) return 1;
    if (!b.orario) return -1;
    return a.orario.localeCompare(b.orario);
  }
  const tutteLeFermateOrdinate = [...tragittoVero.fermate].sort(perOrario);
  const calcoloTragitto = calcolo.find((c) => c.tragittoId === idTragitto);
  const partecipantiPerFermata = new Map(calcoloTragitto?.fermate.map((f) => [f.fermataId, f.passeggeri]) ?? []);
  const totaleBus = linee.reduce((tot, l) => tot + l.bus.length, 0);

  /** Prenotazioni per fermata (a livello di TRAGITTO) — la somma di
   *  in-attesa+assegnati su tutte le linee che coprono quella città; se
   *  nessuna linea la copre ancora, il totale grezzo delle prenotazioni
   *  arrivate su quella fermata. */
  function prenotazioniFermata(f: Fermata): number {
    const primaLineaConQuestaCitta = linee.find((l) => l.fermate.some((lf) => lf.citta === f.citta));
    if (primaLineaConQuestaCitta) {
      const lf = primaLineaConQuestaCitta.fermate.find((x) => x.citta === f.citta)!;
      return linee.reduce((tot, l) => tot + (l.fermate.find((x) => x.citta === f.citta)?.versati ?? 0), 0) + lf.inAttesa;
    }
    return partecipantiPerFermata.get(f.id) ?? 0;
  }

  // Chi viene avvisato quando si esclude una fermata lo calcola il server
  // (anteprima): chi ha prenotato su una fermata che nessuna linea copre
  // riceve l'email di variazione; le fermate già dentro una linea restano
  // servite, e lì non si avvisa nessuno.
  async function alternaFermataAttiva(f: Fermata) {
    const t = tragittoVero;
    if (!t || fermataInSalvataggio) return;
    const escludi = f.attivo;
    const input = {
      // Il prezzo extra del tragitto va rimandato così com'è: senza, il
      // server lo azzerava a ogni esclusione o riattivazione di una fermata.
      prezzoExtra: Number(t.prezzoExtra),
      fermate: t.fermate.map((x) => ({
        fermataAnagraficaId: x.fermataAnagraficaId, citta: x.citta, indirizzo: x.indirizzo ?? undefined,
        orario: x.orario ?? undefined, orarioRitorno: x.orarioRitorno ?? undefined, indirizzoRitorno: x.indirizzoRitorno ?? undefined,
        prezzo: x.prezzo ? Number(x.prezzo) : undefined, postiMax: x.postiMax ?? undefined,
        sogliaMinima: x.sogliaMinima ?? undefined,
        attivo: x.id === f.id ? !x.attivo : x.attivo,
      })),
    };
    setFermataInSalvataggio(f.id);
    try {
      if (escludi) {
        let anteprima: Awaited<ReturnType<typeof eventiApi.anteprimaTragittoOperativo>>;
        try {
          anteprima = await eventiApi.anteprimaTragittoOperativo(idTragitto, input);
        } catch (e) {
          notifica(`Impossibile controllare quali clienti verrebbero avvisati: ${motivoErrore(e)}`, 'errore');
          return;
        }
        const prenotazioni = prenotazioniFermata(f);
        const giaInUnaLinea = linee.some((l) => l.fermate.some((lf) => lf.citta === f.citta));
        if (anteprima.clientiTotali > 0) {
          if (!(await confermaAvvisiClienti(anteprima, 'Escludi e avvisa i clienti'))) return;
        } else if (prenotazioni > 0 && giaInUnaLinea) {
          const ok = await conferma({
            titolo: `Escludere la fermata di ${f.citta}?`,
            testo: <>La fermata resta nelle linee già create, quindi {prenotazioni === 1 ? 'la prenotazione' : `le ${prenotazioni} prenotazioni`} di questa fermata non {prenotazioni === 1 ? 'cambia' : 'cambiano'}. Non si potrà più scegliere per una nuova linea.</>,
            conferma: 'Escludi la fermata',
          });
          if (!ok) return;
        }
      }
      const esito = await eventiApi.aggiornaTragittoOperativo(idTragitto, input);
      notificaEsitoAvvisi(escludi ? `Fermata di ${f.citta} esclusa` : `Fermata di ${f.citta} riattivata`, esito);
      aggiornaDopoModifica();
      preventiviApi.verificaKm(idTragitto).then(setVerificaKm).catch(() => {});
    } catch (e) {
      notifica(`Modifica della fermata non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setFermataInSalvataggio(null);
    }
  }

  function prenotazioniLinea(l: Linea): number {
    return l.fermate.reduce((tot, f) => tot + f.inAttesa + f.versati, 0);
  }

  function apriPannello(tipo: Pannello, lineaId: string | null = null) {
    setPannello(tipo);
    setLineaAttivaId(lineaId);
    setBusInModificaId(null);
  }
  function chiudiPannello() {
    setPannello(null);
    setLineaAttivaId(null);
    setBusInModificaId(null);
  }

  function apriNuovaLinea() {
    setFormBus(BUS_VUOTO);
    setFermateSelezionate([]);
    setStepNuovaLinea(1);
    apriPannello('nuova-linea');
  }

  /** Dal pannello "Pronta da confermare" — fornitore/posti/costo già
   *  presi dal preventivo accettato (nulla da indovinare), e tutte le
   *  fermate attive pre-selezionate (il caso comune: si conferma la
   *  linea così com'è). Riferimento del bus (targa) resta da compilare
   *  — quello non lo sa nessun preventivo. */
  function apriNuovaLineaDaSuggerimento() {
    if (!suggerimento) return;
    setFormBus({ riferimento: '', fornitoreId: suggerimento.fornitoreId ?? undefined, postiBus: suggerimento.postiBus ?? undefined, costo: suggerimento.costo ?? undefined });
    setFermateSelezionate(fermateAttive.map((f) => f.id));
    setStepNuovaLinea(1);
    apriPannello('nuova-linea');
  }

  async function salvaNuovaLinea() {
    if (!formBus.riferimento?.trim() || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore');
      setStepNuovaLinea(1);
      return;
    }
    if (fermateSelezionate.length === 0) {
      notifica('Seleziona almeno una fermata per la linea.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      const esito = await eventiApi.creaLinea(idEvento, { ...formBus, postiBus: formBus.postiBus, fermateIds: fermateSelezionate });
      chiudiPannello();
      // Con la prima linea la partenza diventa confermata e chi ha
      // prenotato riceve l'email: il messaggio dice com'è andata.
      if (esito.partenzaConfermata) notificaEsitoAvvisi('Linea creata e partenza confermata', esito);
      else notifica('Linea creata.', 'successo');
      if (esito.tourLeaderAvvisato !== null) notifica(esito.tourLeaderAvvisato ? 'Il tour leader è stato avvisato via email.' : "L'email al tour leader non è partita: avvisalo tu.", esito.tourLeaderAvvisato ? 'successo' : 'errore');
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  const lineaAttiva = linee.find((l) => l.id === lineaAttivaId);

  function apriModificaBus(lineaId: string, busId: string) {
    const linea = linee.find((l) => l.id === lineaId);
    const bus = linea?.bus.find((b) => b.id === busId);
    if (!bus) return;
    setFormBus({
      riferimento: bus.riferimento, fornitoreId: bus.fornitoreId ?? undefined, autistaNome: bus.autistaNome ?? undefined,
      autistaTelefono: bus.autistaTelefono ?? undefined, tourLeaderId: bus.tourLeaderId, costo: bus.costo ? Number(bus.costo) : undefined,
      postiBus: bus.postiBus ?? undefined, note: bus.note ?? undefined,
    });
    apriPannello('modifica-bus', lineaId);
    setBusInModificaId(busId);
  }

  async function salvaModificaBus() {
    if (!busInModificaId) return;
    if (!formBus.riferimento?.trim() || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      const esito = await eventiApi.aggiornaBusDiLinea(busInModificaId, formBus);
      chiudiPannello();
      if (esito.tourLeaderAvvisato === false) notifica("Bus aggiornato, ma l'email al tour leader non è partita: avvisalo tu.", 'errore');
      else notifica(esito.tourLeaderAvvisato ? 'Bus aggiornato: il tour leader è stato avvisato via email.' : 'Bus aggiornato.', 'successo');
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  function apriAggiungiBus(lineaId: string) {
    setFormBus(BUS_VUOTO);
    apriPannello('aggiungi-bus', lineaId);
  }
  async function salvaBusAggiunto() {
    if (!lineaAttivaId) return;
    if (!formBus.riferimento?.trim() || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      const esito = await eventiApi.aggiungiBusALinea(lineaAttivaId, { ...formBus, postiBus: formBus.postiBus });
      chiudiPannello();
      if (esito.tourLeaderAvvisato === false) notifica("Bus aggiunto alla linea, ma l'email al tour leader non è partita: avvisalo tu.", 'errore');
      else notifica(esito.tourLeaderAvvisato ? 'Bus aggiunto alla linea: il tour leader è stato avvisato via email.' : 'Bus aggiunto alla linea.', 'successo');
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  async function assegnaPrenotazioni(linea: Linea) {
    const inAttesa = linea.fermate.reduce((tot, f) => tot + f.inAttesa, 0);
    if (inAttesa === 0) {
      notifica(`Nessuna prenotazione in attesa su ${linea.nome}.`, 'info');
      return;
    }
    const ok = await conferma({
      titolo: 'Assegnare ai bus le prenotazioni in attesa?',
      testo: <>{plurale(inAttesa, 'prenotazione in attesa', 'prenotazioni in attesa')} di <b>{linea.nome}</b> {inAttesa === 1 ? 'verrà assegnata' : 'verranno assegnate'} ai posti liberi dei bus. Da qui non si può annullare.</>,
      conferma: 'Assegna ai bus',
    });
    if (!ok) return;
    setVersandoLineaId(linea.id);
    try {
      const { versate, restanoInAttesa } = await eventiApi.versaLinea(linea.id);
      aggiornaDopoModifica();
      if (versate === 0 && restanoInAttesa > 0) notifica('Nessun posto libero sui bus di questa linea: aggiungi un bus, o aumenta i posti di quello che c\'è.', 'errore');
      else if (restanoInAttesa > 0) notifica(`${plurale(versate, 'prenotazione assegnata', 'prenotazioni assegnate')} ai bus; ${restanoInAttesa} ${restanoInAttesa === 1 ? 'resta' : 'restano'} in attesa perché i posti sono finiti.`, 'info');
      else notifica(`${plurale(versate, 'prenotazione assegnata', 'prenotazioni assegnate')} ai bus.`, 'successo');
    } catch (e) {
      notifica(`Assegnazione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setVersandoLineaId(null);
    }
  }

  function apriModificaPercorso(lineaId: string) {
    const linea = linee.find((l) => l.id === lineaId);
    if (!linea) return;
    setPercorsoModificato(linea.fermate.map((f) => f.fermataId));
    apriPannello('modifica-percorso', lineaId);
  }
  async function salvaModificaPercorso() {
    if (!lineaAttivaId) return;
    if (percorsoModificato.length === 0) {
      notifica('Seleziona almeno una fermata.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      await eventiApi.aggiornaPercorsoLinea(idEvento, lineaAttivaId, percorsoModificato);
      chiudiPannello();
      notifica('Percorso della linea aggiornato.', 'successo');
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
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

  /** Solo fornitori approvati (come in Preventivi), più quello già
   *  assegnato a questo bus se nel frattempo è stato disattivato: senza,
   *  il menu mostrerebbe "— Nessuno —" e salvando lo si cancellerebbe. */
  function fornitoriScegliibili(attuale: string | undefined | null) {
    return fornitori.filter((f) => f.stato === 'APPROVATO' || f.id === attuale);
  }

  const campiBus = (conTourLeader: boolean) => (
    <>
      <div className="campo"><label>Riferimento (es. targa, o codice dell'agenzia)</label><input value={formBus.riferimento} onChange={(e) => setFormBus({ ...formBus, riferimento: e.target.value })} /></div>
      <div className="campo">
        <label>Fornitore</label>
        <select value={formBus.fornitoreId ?? ''} onChange={(e) => setFormBus({ ...formBus, fornitoreId: e.target.value || undefined })}>
          <option value="">— Nessuno —</option>
          {fornitoriScegliibili(formBus.fornitoreId).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.stato !== 'APPROVATO' ? ' (non attivo)' : ''}</option>)}
        </select>
      </div>
      <div className="campo"><label>Autista (facoltativo)</label><input value={formBus.autistaNome ?? ''} onChange={(e) => setFormBus({ ...formBus, autistaNome: e.target.value })} /></div>
      <div className="campo"><label>Telefono autista (facoltativo)</label><input type="tel" value={formBus.autistaTelefono ?? ''} onChange={(e) => setFormBus({ ...formBus, autistaTelefono: e.target.value })} /></div>
      {conTourLeader && (
        <div className="campo">
          <label>Tour leader (facoltativo)</label>
          <select value={formBus.tourLeaderId ?? ''} onChange={(e) => setFormBus({ ...formBus, tourLeaderId: e.target.value || null })}>
            <option value="">— Nessuno —</option>
            {tourLeaders.map((t) => <option key={t.id} value={t.id}>{t.nome} {t.cognome}</option>)}
          </select>
        </div>
      )}
      <div className="campo"><label>Posti del bus</label><CampoNumero min={0} value={formBus.postiBus} onChange={(v) => setFormBus({ ...formBus, postiBus: v })} /></div>
      <div className="campo"><label>Costo del bus (facoltativo)</label><CampoNumero valuta min={0} value={formBus.costo} onChange={(v) => setFormBus({ ...formBus, costo: v })} /></div>
      <div className="campo"><label>Note (facoltative)</label><input value={formBus.note ?? ''} onChange={(e) => setFormBus({ ...formBus, note: e.target.value })} /></div>
      {erroreElenchi && <p style={{ color: 'var(--pink)', fontSize: 'var(--testo-sm)', marginTop: -6 }}>{erroreElenchi}</p>}
    </>
  );

  return (
    <div>
      {!incorporata && (
        <>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
          <PanelHead titolo={`Linee — ${tragittoVero.nome}`} />
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <p className="testo-intro" style={{ margin: 0 }}>
          {!incorporata && <>{evento.artista} · </>}
          {fermateAttive.length > 0 && <>Passeggeri: {fermateAttive.map((f) => `${f.citta} ${prenotazioniFermata(f)}`).join(' · ')} · </>}
          {plurale(totaleBus, 'bus assegnato', 'bus assegnati')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => setGestisciFermateAperto((v) => !v)}>
            {gestisciFermateAperto ? 'Chiudi fermate' : 'Gestisci fermate'}
          </button>
          <button type="button" className="btn btn-primary btn-piccolo" onClick={apriNuovaLinea}>+ Nuova linea</button>
        </div>
      </div>

      {gestisciFermateAperto && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <p className="testo-intro" style={{ marginTop: -4, marginBottom: 12 }}>
            Escludi una fermata (es. per scarse adesioni): resta nel tragitto, ma non si potrà più scegliere per una nuova linea. Le fermate già dentro una linea non vengono toccate.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tutteLeFermateOrdinate.map((f) => {
              const inSalvataggio = fermataInSalvataggio === f.id;
              if (!f.attivo) {
                return (
                  <span key={f.id} className="chip" style={{ opacity: 0.55 }}>
                    <span style={{ textDecoration: 'line-through' }}>{f.citta}</span>
                    <button type="button" disabled={!!fermataInSalvataggio} onClick={() => alternaFermataAttiva(f)} title="Riattiva questa fermata" aria-label={`Riattiva la fermata di ${f.citta}`} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: 0, fontSize: 'var(--testo-md)' }}>{inSalvataggio ? '…' : '↺'}</button>
                  </span>
                );
              }
              return (
                <span key={f.id} className="chip">
                  {f.citta}
                  <button type="button" disabled={!!fermataInSalvataggio} onClick={() => alternaFermataAttiva(f)} title="Escludi questa fermata" aria-label={`Escludi la fermata di ${f.citta}`} style={{ background: 'none', border: 'none', color: 'var(--mist)', cursor: 'pointer', padding: 0, fontSize: 'var(--testo-md)' }}>{inSalvataggio ? '…' : '✕'}</button>
                </span>
              );
            })}
            {tutteLeFermateOrdinate.length === 0 && <span style={{ color: 'var(--mist)' }}>Nessuna fermata su questo tragitto.</span>}
          </div>
        </div>
      )}

      {verificaKm?.cambiatoParecchio && (
        <div style={{ background: 'var(--dusk)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px', fontSize: 'var(--testo-md)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span><b style={{ color: 'var(--amber)' }}>⚠ Le fermate sono cambiate parecchio</b> da quando hai accettato il preventivo (circa {Math.round(verificaKm.kmAccettati!)} km allora, {Math.round(verificaKm.kmAttuali!)} km ora): potrebbe servire un nuovo preventivo.</span>
          <button type="button" className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => tornaAPartenze('preventivi')}>Vai a Preventivi →</button>
        </div>
      )}

      {/* Suggerimento automatico — appena le prenotazioni confermate
          raggiungono la soglia di pareggio, dice "puoi creare la linea"
          con fornitore/costo/posti già presi dal preventivo accettato:
          nulla da indovinare, solo da controllare e confermare. */}
      {suggerimento?.pronta && (
        <div className="section-card" style={{ marginBottom: 16, borderColor: 'var(--green)' }}>
          <p style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>Pronta da confermare</p>
          <p style={{ fontSize: 'var(--testo-base)', marginBottom: 8 }}>
            {plurale(suggerimento.totaleConfermati, 'passeggero confermato', 'passeggeri confermati')} (soglia di pareggio: {suggerimento.postiDiPareggio}): puoi creare la linea con {suggerimento.postiBus ?? '—'} posti{suggerimento.costo != null ? ` a ${formattaEuro(suggerimento.costo)}` : ''}, come nel preventivo accettato.
          </p>
          {!!suggerimento.fermateSenzaPrenotazioni?.length && (
            <p style={{ fontSize: 'var(--testo-md)', color: 'var(--amber)', marginBottom: 8 }}>
              ⚠ {suggerimento.fermateSenzaPrenotazioni.length === 1 ? '1 fermata senza prenotazioni' : `${suggerimento.fermateSenzaPrenotazioni.length} fermate senza prenotazioni`} ({suggerimento.fermateSenzaPrenotazioni.map((f) => f.citta).join(', ')}): se vuoi accorciare il tragitto, deselezionale nel passo 2. Potrebbe convenire anche chiedere un preventivo nuovo.
            </p>
          )}
          <button type="button" className="btn btn-primary" onClick={apriNuovaLineaDaSuggerimento}>Conferma linea →</button>
        </div>
      )}
      {suggerimento?.serveSecondoBus && (
        <div className="section-card" style={{ marginBottom: 16, borderColor: 'var(--pink)' }}>
          <p style={{ fontWeight: 700, color: 'var(--pink)', marginBottom: 6 }}>⚠ Serve un secondo bus</p>
          <p style={{ fontSize: 'var(--testo-base)', marginBottom: 8 }}>
            {plurale(suggerimento.totaleConfermati, 'passeggero confermato', 'passeggeri confermati')}, ma i bus assegnati coprono solo {suggerimento.capienzaReale} posti.
          </p>
        </div>
      )}

      <div>
        <p className="section-label" style={{ marginBottom: 12 }}>Linee su questo tragitto</p>

        {linee.length === 0 ? (
          <p className="testo-intro">Nessuna linea ancora per questo tragitto: crea la prima con "+ Nuova linea" qui sopra.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {linee.map((l) => {
              const espansa = lineeEspanse.has(l.id);
              const percorso = l.fermate.map((f) => f.citta).join(' → ');
              return (
                <div key={l.id} className="section-card">
                  <div
                    role="button" tabIndex={0} aria-expanded={espansa}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
                    onClick={() => alternaLineaEspansa(l.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternaLineaEspansa(l.id); } }}
                  >
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: 4 }}>{l.nome}</p>
                      <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginBottom: 8 }}>{percorso || 'Nessuna fermata'}</p>
                      <p style={{ fontSize: 'var(--testo-md)' }}>
                        Prenotazioni: <b>{prenotazioniLinea(l)}</b>
                        <span style={{ color: 'var(--mist)' }}> · </span>
                        Bus: <b>{l.bus.length}</b>
                      </p>
                    </div>
                    <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-lg)', flexShrink: 0 }}>{espansa ? '▾' : '▸'}</span>
                  </div>

                  {espansa && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                        {l.fermate.map((f) => (
                          <span key={f.fermataId} className="chip" title={`${f.citta}: ${f.inAttesa} in attesa, ${f.versati} assegnati ai bus`}>
                            {f.citta}{f.orario && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({f.orario})</span>}
                            <span style={{ color: 'var(--pink)', fontFamily: "'Space Mono',monospace" }}>{f.inAttesa}</span>
                            <span style={{ color: 'var(--mist)' }}>/</span>
                            <span style={{ color: 'var(--green)', fontFamily: "'Space Mono',monospace" }}>{f.versati}</span>
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', marginBottom: 14 }}>
                        Per ogni fermata: <span style={{ color: 'var(--pink)' }}>in attesa</span> / <span style={{ color: 'var(--green)' }}>assegnati ai bus</span>
                      </p>

                      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-primary" style={{ fontSize: 'var(--testo-md)' }} onClick={() => assegnaPrenotazioni(l)} disabled={!!versandoLineaId}>
                          {versandoLineaId === l.id ? 'Assegno…' : 'Assegna ai bus le prenotazioni in attesa'}
                        </button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-md)' }} onClick={() => apriModificaPercorso(l.id)}>Modifica percorso</button>
                      </div>

                      <p className="section-label" style={{ fontSize: 'var(--testo-sm)', marginBottom: 8 }}>Bus su questa linea</p>
                      {l.bus.length === 0 ? (
                        <div>
                          <p className="testo-intro" style={{ marginBottom: 10 }}>Nessun bus su questa linea.</p>
                          <button type="button" className="btn btn-primary" style={{ fontSize: 'var(--testo-md)' }} onClick={() => apriAggiungiBus(l.id)}>+ Aggiungi bus</button>
                        </div>
                      ) : (
                        <>
                          {l.bus.map((b) => (
                            <div key={b.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                              <span className="riga-titolo">
                                {b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}
                                {b.tourLeaderNome && <><br /><span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>Tour leader: {b.tourLeaderNome}</span></>}
                                <br /><span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>{b.postiBus != null ? plurale(b.postiBus, 'posto', 'posti') : 'Posti non indicati'}</span>
                              </span>
                              <span className="riga-meta">
                                <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => apriModificaBus(l.id, b.id)}>Modifica</button>
                              </span>
                            </div>
                          ))}
                          <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', marginTop: 12 }} onClick={() => apriAggiungiBus(l.id)}>+ Aggiungi un altro bus a questa linea</button>
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

      {pannello === 'nuova-linea' && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Nuova linea — passo {stepNuovaLinea} di 2</p>

          {stepNuovaLinea === 1 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>Dati del bus</p>
              {campiBus(true)}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  type="button" className="btn btn-primary" style={{ flex: 1 }}
                  onClick={() => {
                    if (!formBus.riferimento?.trim() || !formBus.postiBus) { notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore'); return; }
                    setStepNuovaLinea(2);
                  }}
                >
                  Avanti: scegli le fermate
                </button>
                <button type="button" className="btn btn-ghost" onClick={chiudiPannello}>Annulla</button>
              </div>
            </>
          )}

          {stepNuovaLinea === 2 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>
                Scegli le fermate in qualsiasi ordine: l'ordine finale lo decide l'orario di ciascuna.
              </p>
              {fermateAttive.map((f) => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 'var(--testo-base)' }}>
                  <input
                    type="checkbox"
                    checked={fermateSelezionate.includes(f.id)}
                    onChange={(e) => setFermateSelezionate((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))}
                  />
                  {f.citta} {f.orario && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({f.orario})</span>}
                </label>
              ))}
              {fermateSelezionate.length > 0 && (
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginTop: 10 }}>
                  Ordine finale: {[...fermateAttive].filter((f) => fermateSelezionate.includes(f.id)).sort(perOrario).map((f) => f.citta).join(' → ')}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStepNuovaLinea(1)}>← Dati del bus</button>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={salvaNuovaLinea} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva linea'}</button>
                <button type="button" className="btn btn-ghost" onClick={chiudiPannello}>Annulla</button>
              </div>
            </>
          )}
        </div>
      )}

      {pannello === 'modifica-bus' && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Modifica bus{lineaAttiva ? ` — ${lineaAttiva.nome}` : ''}</p>
          {campiBus(true)}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={salvaModificaBus} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva bus'}</button>
            <button type="button" className="btn btn-ghost" onClick={chiudiPannello}>Annulla</button>
          </div>
        </div>
      )}

      {pannello === 'aggiungi-bus' && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Aggiungi bus{lineaAttiva ? ` — ${lineaAttiva.nome}` : ''}</p>
          <p className="testo-intro" style={{ marginTop: -6 }}>Stesse fermate della linea: non si scelgono qui.</p>
          {campiBus(true)}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={salvaBusAggiunto} disabled={salvando}>{salvando ? 'Salvo…' : 'Aggiungi bus'}</button>
            <button type="button" className="btn btn-ghost" onClick={chiudiPannello}>Annulla</button>
          </div>
        </div>
      )}

      {pannello === 'modifica-percorso' && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Modifica percorso{lineaAttiva ? ` — ${lineaAttiva.nome}` : ''} (vale per tutti i bus della linea)</p>
          {fermateAttive.map((f) => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 'var(--testo-base)' }}>
              <input
                type="checkbox"
                checked={percorsoModificato.includes(f.id)}
                onChange={(e) => setPercorsoModificato((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))}
              />
              {f.citta} {f.orario && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({f.orario})</span>}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={salvaModificaPercorso} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva percorso'}</button>
            <button type="button" className="btn btn-ghost" onClick={chiudiPannello}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
