import { useEffect, useState, type ReactNode } from 'react';
import { notifica } from '../shared/notifiche';
import { conferma } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { confermaAvvisiClienti, notificaEsitoAvvisi } from '../shared/avvisiClienti';
import { AvvisoCambioPercorso, notificaPercorsiCambiati } from '../shared/AvvisoCambioPercorso';
import { Modale } from '../shared/Modale';
import { MenuAzioni } from '../shared/MenuAzioni';
import {
  eventiApi, type Linea, type BusDiLinea, type BusDiLineaInput, type SuggerimentoLinea, type CalcoloBusTragitto, type EsitoConfermaLinea,
  type RiepilogoEconomicoTratta, type AnteprimaSmistamento, type PasseggeroBus,
} from '../../api/eventi';
import type { Evento, Fermata } from '../../api/types';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { preventiviApi, type CambioPercorso, type RichiestaConRisposta } from '../../api/preventivi';
import { PreventiviBus, PreventivoDelBusRiga } from './partenze/PreventiviBus';
import { tourLeaderApi, type TourLeader } from '../../api/tourleader';
import { haPermesso } from '../../api/auth';
import { CampoNumero } from '../shared/CampoNumero';
import { PanelHead } from '../shared/PanelHead';
import { PartenzaArrivo } from '../shared/PartenzaArrivo';
import { useNavigazione } from '../shared/NavigazioneContext';
import { useSessione } from '../shared/SessioneContext';
import { formattaData, formattaDataOra, formattaEuro, giorniAllaData, plurale } from '../../shared/formato';
import { SEZIONE_PARTENZE, type TabPartenze } from './partenze/tipi';

const BUS_VUOTO: BusDiLineaInput = { riferimento: '' };

/** Quanto è pieno un bus o una linea: verde, arancio quasi pieno, rosso oltre. */
function BarraPosti({ occupati, posti }: { occupati: number; posti: number }) {
  const quota = posti > 0 ? occupati / posti : 0;
  const tono = quota > 1 ? 'oltre' : quota >= 0.9 ? 'quasi-piena' : '';
  return (
    <span className={`barra-posti ${tono}`} role="img" aria-label={`${occupati} posti occupati su ${posti}`}>
      <i style={{ width: `${Math.min(100, Math.round(quota * 100))}%` }} />
    </span>
  );
}

/** Il pannello aperto dentro una scheda linea, proprio sotto la riga su
 *  cui si è cliccato: uno alla volta, così un modulo non finisce in fondo
 *  alla pagina (dove non lo si vedeva) né salva sulla linea sbagliata. */
type Pannello =
  | { tipo: 'modifica-bus'; lineaId: string; busId: string }
  | { tipo: 'passeggeri'; lineaId: string; busId: string }
  | { tipo: 'aggiungi-bus'; lineaId: string }
  | { tipo: 'modifica-percorso'; lineaId: string };

/** Il modale a due passi (dati del bus, poi fermate): per una linea nuova o
 *  per confermare una linea da confermare creata in automatico. */
type ModaleLinea = { tipo: 'nuova' } | { tipo: 'conferma'; linea: Linea };

/** Pagina delle linee di UN tragitto — sia come pagina a sé
 *  (?sezione=linee&evento=...&tragitto=...&da=..., aperta da
 *  Confermate/Passate) sia INCORPORATA direttamente dentro "Da
 *  confermare" (props espliciti, niente lettura di URL).
 *
 *  Disposizione: in alto i numeri per decidere (passeggeri, posti sui
 *  bus, pareggio, giorni all'evento, margine), poi un solo "prossimo
 *  passo", poi le fermate in tabella e le linee con dentro i loro bus.
 *
 *  I posti sui bus non si assegnano a mano: li decide lo smistamento
 *  automatico per età il giorno prima della partenza (gruppi uniti, dal
 *  più grande al più giovane). Qui se ne vede l'anteprima.
 *
 *  Le linee "da confermare" nascono da sole: la prima quando le
 *  prenotazioni raggiungono la soglia di pareggio, un'altra ogni volta che
 *  i passeggeri riempiono i posti delle linee che ci sono. Non hanno bus
 *  finché non le si conferma con i dati del bus, e spariscono da sole se
 *  non servono più. Le vendite non si fermano per i posti dei bus.
 *
 *  Per ogni proposta si chiedono i preventivi del bus ai fornitori
 *  (PreventiviBus.tsx): scegliendone uno la conferma parte con i suoi dati,
 *  e ogni bus può avere un fornitore diverso.
 *
 *  Se il percorso è cambiato dopo la quotazione scelta, in cima c'è il
 *  riquadro viola che porta alla quotazione da rifare.
 *
 *  Una "linea" è un CONTENITORE: un percorso (quali fermate copre) che
 *  può avere uno o più bus dentro. Linee diverse dello stesso tragitto
 *  possono coprire fermate diverse. */
export function LineeTragittoScreen(props?: { eventoIdProp?: string; tragittoIdProp?: string; incorporata?: boolean; onModificato?: () => void }) {
  const navigaSezione = useNavigazione();
  const sessione = useSessione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
  const puoScegliereFornitori = haPermesso(sessione, 'preventivi.accetta');
  const parametri = new URLSearchParams(window.location.search);
  const eventoId = props?.eventoIdProp ?? parametri.get('evento');
  const tragittoId = props?.tragittoIdProp ?? parametri.get('tragitto');
  // Da quale voce di Partenze si è arrivati: "← Torna" deve riportare lì.
  const origine = parametri.get('da') as TabPartenze | null;
  const incorporata = !!props?.incorporata;
  const onModificato = props?.onModificato;

  const [evento, setEvento] = useState<Evento | null>(null);
  const [linee, setLinee] = useState<Linea[]>([]);
  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [anteprima, setAnteprima] = useState<AnteprimaSmistamento | null>(null);
  const [economia, setEconomia] = useState<RiepilogoEconomicoTratta[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [erroreElenchi, setErroreElenchi] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  const [fermataInSalvataggio, setFermataInSalvataggio] = useState<string | null>(null);
  const [pannello, setPannello] = useState<Pannello | null>(null);
  const [modaleLinea, setModaleLinea] = useState<ModaleLinea | null>(null);
  // Il preventivo scelto con cui si sta confermando una proposta (null = dati scritti a mano).
  const [rispostaScelta, setRispostaScelta] = useState<RichiestaConRisposta | null>(null);
  const [stepLinea, setStepLinea] = useState<1 | 2>(1);
  const [formBus, setFormBus] = useState<BusDiLineaInput & { postiBus?: number }>(BUS_VUOTO);
  const [fermateSelezionate, setFermateSelezionate] = useState<string[]>([]);
  const [percorsoModificato, setPercorsoModificato] = useState<string[]>([]);
  const [cambioPercorso, setCambioPercorso] = useState<CambioPercorso | null>(null);
  const [suggerimento, setSuggerimento] = useState<SuggerimentoLinea | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [passeggeri, setPasseggeri] = useState<PasseggeroBus[] | null>(null);
  const [errorePasseggeri, setErrorePasseggeri] = useState('');
  const [scaricandoPdfId, setScaricandoPdfId] = useState<string | null>(null);

  // "Carico…" solo la prima volta: dopo una modifica i dati si aggiornano
  // senza smontare la pagina.
  function ricarica() {
    if (!eventoId || !tragittoId) return;
    Promise.all([eventiApi.getById(eventoId), eventiApi.calcolaBus(eventoId), eventiApi.listaLinee(tragittoId)])
      .then(([ev, c, l]) => { setEvento(ev); setCalcolo(c); setLinee(l); setErrore(''); })
      .catch((e) => setErrore(`Impossibile caricare le linee: ${motivoErrore(e)}`))
      .finally(() => setCaricamento(false));
    // Un errore qui non deve sembrare "nessun dato": lo si dice.
    const nonCaricato = (cosa: string) => (e: unknown) => notifica(`${cosa} non caricato: ${motivoErrore(e)}`, 'errore');
    eventiApi.suggerimentoLinea(tragittoId).then(setSuggerimento).catch((e) => { setSuggerimento(null); nonCaricato('Suggerimento della linea')(e); });
    eventiApi.anteprimaSmistamento(tragittoId).then(setAnteprima).catch((e) => { setAnteprima(null); nonCaricato('Smistamento sui bus')(e); });
    if (vedeEconomia) eventiApi.riepilogoEconomico(eventoId).then(setEconomia).catch((e) => { setEconomia([]); nonCaricato('Riepilogo economico')(e); });
  }
  /** Dopo ogni modifica: dati di questa pagina e, se incorporata, la
   *  pagina che la contiene (intestazione e card non restano indietro). */
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
    if (tragittoId) preventiviApi.percorso(tragittoId).then(setCambioPercorso).catch(() => {});
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

  // ---- Dati per i numeri in alto e per le tabelle ----
  const fermateAttive = tragittoVero.fermate.filter((f: Fermata) => f.attivo);
  function perOrario(a: Fermata, b: Fermata) {
    if (!a.orario && !b.orario) return 0;
    if (!a.orario) return 1;
    if (!b.orario) return -1;
    return a.orario.localeCompare(b.orario);
  }
  const tutteLeFermateOrdinate = [...tragittoVero.fermate].sort(perOrario);
  const calcoloTragitto = calcolo.find((c) => c.tragittoId === idTragitto);
  const prenotatiPerFermata = new Map(calcoloTragitto?.fermate.map((f) => [f.fermataId, f.passeggeri]) ?? []);
  const passeggeriTotali = calcoloTragitto?.totalePasseggeri ?? 0;
  const lineeConfermate = linee.filter((l) => !l.daConfermare);
  const lineeDaConfermare = linee.filter((l) => l.daConfermare);
  /** Una proposta automatica è un bus (in più su una linea, o il primo bus di
   *  un tragitto senza linee) oppure una linea nuova che salta le prime fermate. */
  const propostaDiBus = (l: Linea) => !!l.busPerLinea || lineeConfermate.length === 0;
  const nomeProposta = (l: Linea) => (lineeConfermate.length === 0 ? `Primo bus · ${l.nome}` : l.nome);
  const tuttiIBus = lineeConfermate.flatMap((l) => l.bus);
  const postiSuiBus = tuttiIBus.reduce((tot, b) => tot + (b.postiBus ?? 0), 0);
  const postiPrevistiPerLinea = tragittoVero.preventivoPostiBus;
  const costoQuotazione = tragittoVero.preventivoCosto ? Number(tragittoVero.preventivoCosto) : null;
  const datiEconomia = economia.find((e) => e.tragittoId === idTragitto);
  const anteprimaPerBus = new Map((anteprima?.linee ?? []).flatMap((l) => l.bus).map((b) => [b.busId, b]));
  const giorniAllEvento = giorniAllaData(evento.data); // giorni di calendario, ora di Roma
  const testoGiorni = giorniAllEvento < 0 ? 'Passato' : giorniAllEvento === 0 ? 'Oggi' : giorniAllEvento === 1 ? 'Domani' : `Tra ${giorniAllEvento} giorni`;
  // Senza un preventivo scelto: solo i posti di riferimento della quotazione.
  // Fornitore e costo si scrivono a mano (ogni bus può avere un fornitore
  // diverso da chi ha dato la quotazione).
  const busDaQuotazione: BusDiLineaInput & { postiBus?: number } = {
    riferimento: '',
    postiBus: tragittoVero.preventivoPostiBus ?? undefined,
  };

  // Dallo smistamento (vero o simulato): chi ha un posto e chi no, per città.
  const conPostoPerCitta = new Map<string, number>();
  for (const b of (anteprima?.linee ?? []).flatMap((l) => l.bus)) {
    for (const f of b.perFermata) conPostoPerCitta.set(f.citta, (conPostoPerCitta.get(f.citta) ?? 0) + f.passeggeri);
  }
  const senzaPostoPerCitta = new Map((anteprima?.senzaPosto.perFermata ?? []).map((f) => [f.citta, f.passeggeri]));
  const passeggeriConPosto = [...conPostoPerCitta.values()].reduce((s, n) => s + n, 0);
  const fermateConPrenotati = fermateAttive.filter((f) => (prenotatiPerFermata.get(f.id) ?? 0) > 0).length;

  /** Alla quotazione di QUESTO tragitto in Partenze, Quotazione (non all'elenco). */
  function vaiAlPreventivo() {
    navigaSezione(SEZIONE_PARTENZE.preventivi as never, { evento: null, tragitto: null, da: null, eventoId: idEvento, tragittiIds: idTragitto });
  }

  // ---- Fermate ----
  // Chi viene avvisato quando si esclude una fermata lo calcola il server
  // (anteprima): chi ha prenotato su una fermata che nessuna linea
  // confermata copre riceve l'email di variazione; le fermate già dentro
  // una linea confermata restano servite, e lì non si avvisa nessuno.
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
        let avvisi: Awaited<ReturnType<typeof eventiApi.anteprimaTragittoOperativo>>;
        try {
          avvisi = await eventiApi.anteprimaTragittoOperativo(idTragitto, input);
        } catch (e) {
          notifica(`Impossibile controllare quali clienti verrebbero avvisati: ${motivoErrore(e)}`, 'errore');
          return;
        }
        const prenotati = prenotatiPerFermata.get(f.id) ?? 0;
        const giaInUnaLinea = lineeConfermate.some((l) => l.fermate.some((lf) => lf.citta === f.citta));
        if (avvisi.clientiTotali > 0) {
          if (!(await confermaAvvisiClienti(avvisi, 'Escludi e avvisa i clienti'))) return;
        } else if (prenotati > 0 && giaInUnaLinea) {
          const ok = await conferma({
            titolo: `Escludere la fermata di ${f.citta}?`,
            testo: <>La fermata resta nelle linee già create, quindi chi ha prenotato lì non cambia viaggio. Non si potrà più scegliere per una nuova linea.</>,
            conferma: 'Escludi la fermata',
          });
          if (!ok) return;
        }
      }
      const esito = await eventiApi.aggiornaTragittoOperativo(idTragitto, input);
      notificaEsitoAvvisi(escludi ? `Fermata di ${f.citta} esclusa` : `Fermata di ${f.citta} riattivata`, esito);
      notificaPercorsiCambiati(esito.percorsiCambiati);
      aggiornaDopoModifica();
      preventiviApi.percorso(idTragitto).then(setCambioPercorso).catch(() => {});
    } catch (e) {
      notifica(`Modifica della fermata non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setFermataInSalvataggio(null);
    }
  }

  // ---- Pannelli ----
  function chiudiPannello() {
    setPannello(null);
  }
  function apriNuovaLinea() {
    setRispostaScelta(null);
    setFormBus(BUS_VUOTO);
    setFermateSelezionate([]);
    setStepLinea(1);
    chiudiPannello();
    setModaleLinea({ tipo: 'nuova' });
  }
  /** Con i posti della quotazione e tutte le fermate attive già scelte. */
  function apriNuovaLineaDaSuggerimento() {
    setRispostaScelta(null);
    setFormBus(busDaQuotazione);
    setFermateSelezionate(fermateAttive.map((f) => f.id));
    setStepLinea(1);
    chiudiPannello();
    setModaleLinea({ tipo: 'nuova' });
  }
  /** Conferma di una linea da confermare: con il preventivo scelto (fornitore,
   *  costo e posti già scritti) o a mano, e le fermate della linea (solo
   *  quelle ancora attive, le altre non si possono scegliere). */
  function apriConfermaLinea(linea: Linea, scelta?: RichiestaConRisposta) {
    setRispostaScelta(scelta?.risposta ? scelta : null);
    setFormBus(scelta?.risposta
      ? { riferimento: '', fornitoreId: scelta.fornitore.id, costo: Number(scelta.risposta.prezzo), postiBus: scelta.risposta.postiBus ?? busDaQuotazione.postiBus }
      : busDaQuotazione);
    setFermateSelezionate(linea.fermate.map((f) => f.fermataId).filter((id) => fermateAttive.some((f) => f.id === id)));
    setStepLinea(1);
    chiudiPannello();
    setModaleLinea({ tipo: 'conferma', linea });
  }

  async function salvaLinea() {
    if (!modaleLinea) return;
    if (!formBus.riferimento?.trim() || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore');
      setStepLinea(1);
      return;
    }
    if (fermateSelezionate.length === 0) {
      notifica('Seleziona almeno una fermata per la linea.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      const input = { ...formBus, postiBus: formBus.postiBus, fermateIds: fermateSelezionate };
      const esito = modaleLinea.tipo === 'conferma'
        ? await eventiApi.confermaLinea(modaleLinea.linea.id, { ...input, rispostaId: rispostaScelta?.risposta?.id })
        : await eventiApi.creaLinea(idEvento, input);
      const fatto = modaleLinea.tipo === 'conferma'
        ? (modaleLinea.linea.busPerLinea ? `Bus aggiunto a ${modaleLinea.linea.busPerLinea.nome}` : `${nomeProposta(modaleLinea.linea)} confermato`)
        : 'Linea creata';
      setModaleLinea(null);
      // Con la prima linea confermata la partenza diventa confermata e chi
      // ha prenotato riceve l'email: il messaggio dice com'è andata.
      if (esito.partenzaConfermata) notificaEsitoAvvisi(`${fatto} e partenza confermata`, esito);
      else notifica(`${fatto}.`, 'successo');
      if (esito.tourLeaderAvvisato !== null) notifica(esito.tourLeaderAvvisato ? 'Il tour leader è stato avvisato via email.' : "L'email al tour leader non è partita: avvisalo tu.", esito.tourLeaderAvvisato ? 'successo' : 'errore');
      // Fornitori che avevano mandato un preventivo per questo bus.
      if (modaleLinea.tipo === 'conferma') {
        const { fornitoreSceltoAvvisato, fornitoriNonSceltiAvvisati } = esito as EsitoConfermaLinea;
        if (fornitoreSceltoAvvisato != null) notifica(fornitoreSceltoAvvisato ? 'Il fornitore scelto è stato avvisato via email: ora carica il preventivo firmato sotto il bus.' : "L'email al fornitore scelto non è partita: avvisalo tu.", fornitoreSceltoAvvisato ? 'successo' : 'errore');
        if (fornitoriNonSceltiAvvisati > 0) notifica(`${plurale(fornitoriNonSceltiAvvisati, 'fornitore non scelto è stato avvisato', 'fornitori non scelti sono stati avvisati')}.`, 'successo');
      }
      setRispostaScelta(null);
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
      // Una linea da confermare può essere sparita nel frattempo (non
      // serviva più): la pagina si rimette in pari.
      if (modaleLinea.tipo === 'conferma') ricarica();
    } finally {
      setSalvando(false);
    }
  }

  function apriModificaBus(lineaId: string, bus: BusDiLinea) {
    if (pannello?.tipo === 'modifica-bus' && pannello.busId === bus.id) { chiudiPannello(); return; }
    setFormBus({
      riferimento: bus.riferimento, fornitoreId: bus.fornitoreId ?? undefined, autistaNome: bus.autistaNome ?? undefined,
      autistaTelefono: bus.autistaTelefono ?? undefined, tourLeaderId: bus.tourLeaderId, costo: bus.costo ? Number(bus.costo) : undefined,
      postiBus: bus.postiBus ?? undefined, note: bus.note ?? undefined,
    });
    setPannello({ tipo: 'modifica-bus', lineaId, busId: bus.id });
  }
  async function salvaModificaBus(busId: string) {
    if (!formBus.riferimento?.trim() || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      const esito = await eventiApi.aggiornaBusDiLinea(busId, formBus);
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
    if (pannello?.tipo === 'aggiungi-bus' && pannello.lineaId === lineaId) { chiudiPannello(); return; }
    setFormBus(BUS_VUOTO);
    setPannello({ tipo: 'aggiungi-bus', lineaId });
  }
  async function salvaBusAggiunto(lineaId: string) {
    if (!formBus.riferimento?.trim() || !formBus.postiBus) {
      notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      const esito = await eventiApi.aggiungiBusALinea(lineaId, { ...formBus, postiBus: formBus.postiBus });
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

  async function rimuoviBus(linea: Linea, bus: BusDiLinea) {
    const ok = await conferma({
      titolo: `Rimuovere il bus ${bus.riferimento}?`,
      testo: <>Il bus viene tolto da <b>{linea.nome}</b>. I passeggeri già assegnati tornano in attesa e verranno smistati di nuovo sugli altri bus.</>,
      conferma: 'Rimuovi bus',
      pericolosa: true,
    });
    if (!ok) return;
    try {
      await eventiApi.rimuoviBus(idEvento, bus.id);
      chiudiPannello();
      notifica(`Bus ${bus.riferimento} rimosso.`, 'successo');
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Rimozione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  async function eliminaLinea(linea: Linea) {
    // Chi ha prenotato su una fermata esclusa coperta solo da questa linea
    // resterebbe senza bus: prima si vede chi riceverà l'avviso.
    let avvisi: Awaited<ReturnType<typeof eventiApi.anteprimaModificaLinea>>;
    try {
      avvisi = await eventiApi.anteprimaModificaLinea(linea.id);
    } catch (e) {
      notifica(`Impossibile controllare quali clienti verrebbero avvisati: ${motivoErrore(e)}`, 'errore');
      return;
    }
    if (avvisi.clientiTotali > 0) {
      if (!(await confermaAvvisiClienti(avvisi, 'Elimina e avvisa i clienti'))) return;
    } else {
      const ok = await conferma({
        titolo: `Eliminare ${linea.nome}?`,
        testo: <>{linea.bus.length === 0 ? 'Viene tolta la linea, che non ha bus.' : `Vengono tolti la linea e ${linea.bus.length === 1 ? 'il suo bus' : `i suoi ${linea.bus.length} bus`}.`} I passeggeri già assegnati tornano in attesa e verranno smistati di nuovo sulle altre linee.</>,
        conferma: 'Elimina linea',
        pericolosa: true,
      });
      if (!ok) return;
    }
    try {
      const esito = await eventiApi.eliminaLinea(linea.id);
      chiudiPannello();
      notificaEsitoAvvisi(`${linea.nome} eliminata`, esito);
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Eliminazione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  function apriModificaPercorso(linea: Linea) {
    setPercorsoModificato(linea.fermate.map((f) => f.fermataId));
    setPannello({ tipo: 'modifica-percorso', lineaId: linea.id });
  }
  async function salvaModificaPercorso(lineaId: string) {
    if (percorsoModificato.length === 0) {
      notifica('Seleziona almeno una fermata.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      // Una fermata esclusa tolta dal percorso resterebbe senza bus: prima si vede chi verrà avvisato.
      const avvisi = await eventiApi.anteprimaModificaLinea(lineaId, percorsoModificato);
      if (avvisi.clientiTotali > 0 && !(await confermaAvvisiClienti(avvisi, 'Salva e avvisa i clienti'))) return;
      const esito = await eventiApi.aggiornaPercorsoLinea(idEvento, lineaId, percorsoModificato);
      chiudiPannello();
      notificaEsitoAvvisi('Percorso della linea aggiornato', esito);
      aggiornaDopoModifica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  async function apriPasseggeri(lineaId: string, busId: string) {
    if (pannello?.tipo === 'passeggeri' && pannello.busId === busId) { chiudiPannello(); return; }
    setPannello({ tipo: 'passeggeri', lineaId, busId });
    setPasseggeri(null);
    setErrorePasseggeri('');
    try {
      setPasseggeri(await eventiApi.listaPasseggeriBus(idEvento, busId));
    } catch (e) {
      setErrorePasseggeri(`Impossibile caricare i passeggeri: ${motivoErrore(e)}`);
    }
  }
  async function scaricaPdfPasseggeri(bus: BusDiLinea) {
    setScaricandoPdfId(bus.id);
    try {
      const file = await eventiApi.scaricaPdfPasseggeriBus(idEvento, bus.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `passeggeri-${bus.riferimento.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifica(`Download non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setScaricandoPdfId(null);
    }
  }

  /** Solo fornitori approvati (come in Preventivi), più quello già
   *  assegnato a questo bus se nel frattempo è stato disattivato. */
  function fornitoriScegliibili(attuale: string | undefined | null) {
    return fornitori.filter((f) => f.stato === 'APPROVATO' || f.id === attuale);
  }

  /** Con i permessi sugli incassi: quanto resterebbe aggiungendo questo bus. */
  function anteprimaMargine(costoNuovoBus: number | undefined): ReactNode {
    if (!vedeEconomia || !datiEconomia) return null;
    if (costoNuovoBus == null) return <p className="nota-margine" style={{ color: 'var(--mist)' }}>Inserisci il costo del bus per vedere il margine.</p>;
    const costoTotale = (datiEconomia.costoCensito ? datiEconomia.costo : 0) + costoNuovoBus;
    const margine = datiEconomia.incassato - costoTotale - datiEconomia.commissioni;
    return (
      <p className="nota-margine" style={{ color: margine >= 0 ? 'var(--green)' : 'var(--pink)' }}>
        Incassati {formattaEuro(datiEconomia.incassato)} · costo dei bus {formattaEuro(costoTotale)}
        {datiEconomia.commissioni > 0 && <> · commissioni {formattaEuro(datiEconomia.commissioni)}</>}
        {' '}· margine {formattaEuro(margine)}{margine < 0 ? ' (per ora in perdita)' : ''}
      </p>
    );
  }

  const campiBus = (mostraMargine: boolean) => (
    <>
      <div className="campo"><label>Riferimento (es. targa, o codice dell'agenzia)</label><input value={formBus.riferimento} onChange={(e) => setFormBus({ ...formBus, riferimento: e.target.value })} /></div>
      <div className="form-grid">
        <label>Posti del bus<CampoNumero min={0} value={formBus.postiBus} onChange={(v) => setFormBus({ ...formBus, postiBus: v })} /></label>
        <label>Costo del bus (facoltativo)<CampoNumero valuta min={0} value={formBus.costo} onChange={(v) => setFormBus({ ...formBus, costo: v })} /></label>
      </div>
      {mostraMargine && anteprimaMargine(formBus.costo)}
      <div className="form-grid">
        <label>Fornitore
          {/* Con un preventivo scelto il fornitore è il suo. */}
          <select value={formBus.fornitoreId ?? ''} disabled={!!rispostaScelta && !!modaleLinea} onChange={(e) => setFormBus({ ...formBus, fornitoreId: e.target.value || undefined })}>
            <option value="">— Nessuno —</option>
            {fornitoriScegliibili(formBus.fornitoreId).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.stato !== 'APPROVATO' ? ' (non attivo)' : ''}</option>)}
          </select>
        </label>
        <label>Tour leader (facoltativo)
          <select value={formBus.tourLeaderId ?? ''} onChange={(e) => setFormBus({ ...formBus, tourLeaderId: e.target.value || null })}>
            <option value="">— Nessuno —</option>
            {/* Gli archiviati non si assegnano; quello già sul bus resta visibile. */}
            {tourLeaders.filter((t) => t.stato !== 'ARCHIVIATO' || t.id === formBus.tourLeaderId).map((t) => (
              <option key={t.id} value={t.id}>{t.nome} {t.cognome}{t.stato === 'ARCHIVIATO' ? ' (archiviato)' : ''}</option>
            ))}
          </select>
        </label>
        <label>Autista (facoltativo)<input value={formBus.autistaNome ?? ''} onChange={(e) => setFormBus({ ...formBus, autistaNome: e.target.value })} /></label>
        <label>Telefono autista (facoltativo)<input type="tel" value={formBus.autistaTelefono ?? ''} onChange={(e) => setFormBus({ ...formBus, autistaTelefono: e.target.value })} /></label>
        <label className="full">Note (facoltative)<input value={formBus.note ?? ''} onChange={(e) => setFormBus({ ...formBus, note: e.target.value })} /></label>
      </div>
      {erroreElenchi && <p style={{ color: 'var(--pink)', fontSize: 'var(--testo-sm)', marginTop: 8 }}>{erroreElenchi}</p>}
    </>
  );

  // ---- Il prossimo passo: una cosa sola, con un solo pulsante blu ----
  let prossimoPasso: { tono: 'azione' | 'avviso' | 'info'; titolo: string; testo: ReactNode; azione?: { testo: string; onClick: () => void } };
  // Il contatore del pareggio (dal server, stesso conto delle proposte): sempre
  // per il prossimo bus non ancora proposto, da 0 al pareggio.
  const contatore = suggerimento?.contatorePareggio ?? null;
  const mancantiAlPareggio = contatore ? contatore.pareggio - contatore.contati : null;
  const alPareggioDel = contatore ? ` del ${contatore.bus}° bus` : '';
  // Chi resta senza posto con i bus confermati: gruppi interi, solo sui bus
  // delle linee che si fermano alla sua fermata (non passeggeri meno posti).
  const senzaPosto = anteprima?.senzaPosto ?? null;
  const testoSenzaPosto = senzaPosto?.perFermata.map((f) => `${f.citta}: ${f.gruppi.length === 1 ? `un gruppo da ${f.gruppi[0]}` : `gruppi da ${f.gruppi.join(', ')}`}`).join(' · ') ?? '';
  /** La linea confermata che si ferma alla prima fermata di chi è senza posto (per "Aggiungi un bus"). */
  const lineaPerSenzaPosto = senzaPosto?.perFermata.length
    ? lineeConfermate.find((l) => l.fermate.some((f) => f.citta === senzaPosto.perFermata[0].citta)) ?? lineeConfermate[0]
    : lineeConfermate[0];
  if (lineeDaConfermare.length > 0) {
    const prima = lineeDaConfermare[0];
    const diBus = propostaDiBus(prima);
    prossimoPasso = {
      tono: 'azione',
      titolo: lineeDaConfermare.length === 1 ? `${nomeProposta(prima)} da confermare` : `${lineeDaConfermare.length} proposte da confermare`,
      testo: lineeConfermate.length === 0
        ? 'Le prenotazioni hanno raggiunto il pareggio: chiedi i preventivi per il primo bus ai fornitori, qui sotto nella proposta, poi scegli e conferma. Se hai già un accordo, conferma inserendo i dati.'
        : diBus
          ? 'Chi è rimasto fuori dai posti dei bus ha raggiunto di nuovo il pareggio: chiedi i preventivi per il bus in più, poi scegli e conferma. Intanto le vendite continuano.'
          : `Le prime fermate sono già coperte dai bus e da ${prima.fermate[0]?.citta ?? 'una fermata successiva'} in poi i prenotati raggiungono il pareggio: conviene una linea che parta da lì.`,
      // I preventivi del bus si chiedono e si scelgono dentro la proposta, qui sotto.
      azione: { testo: 'Vai ai preventivi del bus', onClick: () => document.getElementById(`proposta-${prima.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    };
  } else if (lineeConfermate.length === 0) {
    prossimoPasso = suggerimento?.pronta
      ? { tono: 'azione', titolo: 'Pronta da confermare', testo: 'Le prenotazioni coprono il costo della quotazione: crea la linea con i dati del bus.', azione: { testo: 'Crea la linea', onClick: apriNuovaLineaDaSuggerimento } }
      : {
        tono: 'info',
        titolo: 'Nessuna linea ancora',
        testo: mancantiAlPareggio
          ? `Mancano ${plurale(mancantiAlPareggio, 'passeggero', 'passeggeri')} al pareggio${alPareggioDel}: a quel punto il primo bus da confermare si propone da solo. Se vuoi, puoi creare la linea già adesso.`
          : 'Il primo bus da confermare si propone da solo quando le prenotazioni raggiungono il pareggio.',
        azione: { testo: 'Crea la linea', onClick: apriNuovaLinea },
      };
  } else if (senzaPosto && senzaPosto.passeggeri > 0) {
    prossimoPasso = {
      tono: 'avviso',
      titolo: `${plurale(senzaPosto.passeggeri, 'passeggero', 'passeggeri')} senza posto`,
      testo: (
        <>
          {testoSenzaPosto}. I gruppi non si dividono e salgono solo sui bus delle linee che si fermano alla loro fermata: i posti liberi che restano non bastano per loro.
          {' '}{mancantiAlPareggio
            ? `Il ${contatore?.bus}° bus si propone da solo quando arrivano al pareggio (mancano ${plurale(mancantiAlPareggio, 'passeggero', 'passeggeri')}); se serve, aggiungilo già adesso.`
            : 'Aggiungi un bus alla linea che si ferma lì.'}
        </>
      ),
      azione: lineaPerSenzaPosto ? { testo: `Aggiungi un bus a ${lineaPerSenzaPosto.nome}`, onClick: () => apriAggiungiBus(lineaPerSenzaPosto.id) } : undefined,
    };
  } else if (anteprima?.giaSmistato) {
    prossimoPasso = { tono: 'info', titolo: 'Passeggeri smistati', testo: 'I passeggeri sono sui bus: i clienti hanno ricevuto il biglietto e i tour leader vedono la lista.' };
  } else {
    prossimoPasso = { tono: 'info', titolo: 'Tutto pronto', testo: <>Lo smistamento per età parte {anteprima?.smistamentoIl ? `il ${formattaDataOra(anteprima.smistamentoIl)}` : 'il giorno prima della partenza'}: da quel momento i clienti ricevono il biglietto e i tour leader la lista dei passeggeri.</> };
  }

  // Nella conferma: da dove arrivano i dati del bus.
  const testoDatiBus = rispostaScelta?.risposta
    ? `Preventivo scelto di ${rispostaScelta.fornitore.nome} (${formattaEuro(rispostaScelta.risposta.prezzo)}): fornitore, costo e posti sono già scritti, scrivi la targa. Alla conferma riceverà l'email, e chi ha risposto senza essere scelto l'avviso.`
    : 'Nessun preventivo scelto: scrivi fornitore, costo e targa del bus (i posti arrivano dalla quotazione).';

  /** La linea confermata su cui va un bus proposto (null per il primo bus di
   *  un tragitto o per una linea nuova: quelle restano schede a sé). */
  const lineaDelBusProposto = (p: Linea) => (p.busPerLinea ? lineeConfermate.find((l) => l.id === p.busPerLinea!.id) ?? null : null);

  /** Una proposta da confermare: nessun bus, i preventivi e un pulsante per
   *  confermarla a mano. Con `linea` è un bus in più e sta dentro la scheda
   *  di quella linea; senza, è una scheda a sé (primo bus o linea nuova). */
  const schedaProposta = (p: Linea, percorso: string, linea?: Linea) => {
    const diBus = propostaDiBus(p);
    const motivo = lineeConfermate.length === 0
      ? 'Proposto in automatico: le prenotazioni hanno raggiunto il pareggio. Confermando il bus nasce la linea con queste fermate.'
      : diBus
        ? 'Proposto in automatico: chi resta fuori dai posti dei bus ha raggiunto di nuovo il pareggio. Fa le stesse fermate della linea.'
        : `Proposta in automatico: le fermate prima di ${p.fermate[0]?.citta ?? 'questa'} sono già coperte dai bus, e da lì in poi i prenotati raggiungono il pareggio.`;
    const postiPrevisti = postiPrevistiPerLinea ? plurale(postiPrevistiPerLinea, 'posto previsto', 'posti previsti') : '';
    // Dentro la linea basta "Bus 2": la linea è la scheda stessa.
    const nome = linea ? p.nome.replace(` · ${linea.nome}`, '') : nomeProposta(p);
    return (
      <div key={p.id} id={`proposta-${p.id}`} className={linea ? 'bus-proposto' : 'scheda-linea da-confermare'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>{nome} <span className="badge badge-stato-rosso" style={{ marginLeft: 4 }}>Da confermare</span></p>
            <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '2px 0 0' }}>
              {linea ? postiPrevisti || 'Posti della quotazione non indicati' : `${percorso || 'Nessuna fermata'}${postiPrevisti ? ` · ${postiPrevisti}` : ''}`}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-piccolo" title="Se hai già un accordo con un fornitore, senza chiedere preventivi" onClick={() => apriConfermaLinea(p)}>{diBus ? 'Conferma a mano' : 'Conferma la linea a mano'}</button>
        </div>
        <p style={{ fontSize: 'var(--testo-md)', margin: '10px 0 0' }}>{motivo} Chiedi i preventivi per questo bus, scegli il fornitore e conferma: da quel momento lo smistamento per età ci mette i passeggeri.</p>
        {!diBus && (
          <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', margin: '6px 0 0' }}>Preferisci un bus in più su una linea già confermata? Aggiungilo lì: questa proposta sparisce da sola.</p>
        )}
        <PreventiviBus proposta={p} tragitto={tragittoVero} puoScegliere={puoScegliereFornitori} onScegli={(scelta) => apriConfermaLinea(p, scelta)} />
      </div>
    );
  };

  // "Pareggio 3° bus: 0 / 9": riparte da 0 appena nasce la proposta del bus prima.
  const pareggio = contatore ? `${contatore.contati} / ${contatore.pareggio}` : '—';

  return (
    <div>
      {!incorporata && (
        <>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
          <PanelHead titolo={`Linee — ${tragittoVero.nome}`} />
          <p className="testo-intro" style={{ marginTop: -10 }}>{evento.artista} · {formattaData(evento.data)}</p>
        </>
      )}

      <PartenzaArrivo tragitto={tragittoVero} />

      <div className="riepilogo-numeri">
        <div className="riepilogo-numero">
          <span>Passeggeri</span><b>{passeggeriTotali}</b>
          <small>{plurale(fermateConPrenotati, 'fermata', 'fermate')} con prenotati</small>
        </div>
        <div className="riepilogo-numero">
          <span>Posti sui bus</span><b>{postiSuiBus}</b>
          <small>{plurale(tuttiIBus.length, 'bus', 'bus')} · {plurale(lineeConfermate.length, 'linea', 'linee')}{anteprima ? ` · ${passeggeriConPosto} occupati` : ''}</small>
          {postiSuiBus > 0 && <BarraPosti occupati={passeggeriConPosto} posti={postiSuiBus} />}
        </div>
        {senzaPosto && lineeConfermate.length > 0 && (
          <div className={`riepilogo-numero ${senzaPosto.passeggeri > 0 ? 'rosso' : 'verde'}`}>
            <span>Senza posto</span><b>{senzaPosto.passeggeri}</b>
            <small>{senzaPosto.passeggeri > 0 ? testoSenzaPosto : 'Tutti hanno un posto'}</small>
          </div>
        )}
        <div className="riepilogo-numero">
          <span>{contatore ? `Pareggio ${contatore.bus}° bus` : 'Pareggio'}</span><b>{pareggio}</b>
          <small>{contatore ? 'conta chi resterebbe senza posto' : 'serve una quotazione'}</small>
        </div>
        <div className="riepilogo-numero">
          <span>Evento</span><b>{testoGiorni}</b>
          <small>{anteprima?.giaSmistato ? 'Passeggeri sui bus' : anteprima?.smistamentoIl ? `Smistamento dal ${formattaDataOra(anteprima.smistamentoIl)}` : 'Smistamento il giorno prima'}</small>
        </div>
        {vedeEconomia && datiEconomia && (
          <div className="riepilogo-numero">
            <span>Margine</span>
            <b style={{ color: datiEconomia.costoCensito ? (datiEconomia.guadagno >= 0 ? 'var(--green)' : 'var(--pink)') : undefined }}>
              {datiEconomia.costoCensito ? formattaEuro(datiEconomia.guadagno) : '—'}
            </b>
          </div>
        )}
      </div>

      {cambioPercorso && (
        <AvvisoCambioPercorso
          cambio={cambioPercorso}
          azioni={<button type="button" className="btn btn-viola" onClick={vaiAlPreventivo}>Vai alla quotazione di questo tragitto →</button>}
        />
      )}

      <div className={`prossimo-passo ${prossimoPasso.tono}`} role={prossimoPasso.tono === 'avviso' ? 'alert' : undefined}>
        <div>
          <p className="titolo">{prossimoPasso.titolo}</p>
          <p>{prossimoPasso.testo}</p>
        </div>
        {prossimoPasso.azione && <button type="button" className="btn btn-primary" onClick={prossimoPasso.azione.onClick}>{prossimoPasso.azione.testo}</button>}
      </div>

      <p className="section-label" style={{ marginBottom: 8 }}>Fermate</p>
      <div className="tabella-righe fermate-linee">
        <div className="riga intestazione">
          <span>Fermata</span><span className="num">Orario</span><span className="num">Prenotati</span>
          <span className="num">{anteprima?.giaSmistato ? 'Sui bus' : 'Con posto'}</span><span className="num">Senza posto</span><span />
        </div>
        {tutteLeFermateOrdinate.length === 0 && <div className="riga"><span style={{ color: 'var(--mist)' }}>Nessuna fermata su questo tragitto.</span></div>}
        {tutteLeFermateOrdinate.map((f) => {
          const lineeFermata = lineeConfermate.filter((l) => l.fermate.some((x) => x.citta === f.citta)).map((l) => l.nome);
          const fuori = senzaPostoPerCitta.get(f.citta) ?? 0;
          return (
          <div key={f.id} className={`riga${f.attivo ? '' : ' spenta'}`}>
            <span style={{ minWidth: 0 }}>
              {f.citta}{!f.attivo && <span style={{ fontSize: 'var(--testo-sm)' }}> · esclusa</span>}
              {f.attivo && lineeConfermate.length > 0 && (
                <small className="sotto">{lineeFermata.length > 0 ? lineeFermata.join(' · ') : 'Nessuna linea si ferma qui'}</small>
              )}
            </span>
            <span className="num">{f.orario ?? '—'}</span>
            <span className="num">{prenotatiPerFermata.get(f.id) ?? 0}</span>
            <span className="num">{anteprima ? conPostoPerCitta.get(f.citta) ?? 0 : '—'}</span>
            <span className={`num${fuori > 0 ? ' valore-rosso' : ''}`}>{anteprima ? fuori : '—'}</span>
            <span style={{ textAlign: 'right' }}>
              {fermataInSalvataggio === f.id ? '…' : (
                <MenuAzioni etichetta={`Azioni sulla fermata di ${f.citta}`} voci={[f.attivo
                  ? { testo: 'Escludi la fermata', onClick: () => alternaFermataAttiva(f) }
                  : { testo: 'Riattiva la fermata', onClick: () => alternaFermataAttiva(f) }]} />
              )}
            </span>
          </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <p className="section-label" style={{ margin: 0 }}>Linee</p>
        <button type="button" className="btn btn-ghost btn-piccolo" onClick={apriNuovaLinea}>+ Nuova linea</button>
      </div>

      {linee.length === 0 && <p className="testo-intro">Nessuna linea ancora per questo tragitto.</p>}
      {linee.map((l) => {
        const percorso = l.fermate.map((f) => f.citta).join(' → ');

        // Un bus in più proposto su una linea confermata si vede dentro la sua linea, qui sotto.
        if (l.daConfermare && lineaDelBusProposto(l)) return null;
        if (l.daConfermare) return schedaProposta(l, percorso);

        const postiLinea = l.bus.reduce((tot, b) => tot + (b.postiBus ?? 0), 0);
        // Chi è su questa linea (o ci andrebbe con lo smistamento): la somma dei suoi bus.
        const occupatiLinea = l.bus.reduce((tot, b) => tot + (anteprimaPerBus.get(b.id)?.passeggeri ?? 0), 0);
        const proposteSuLinea = lineeDaConfermare.filter((p) => lineaDelBusProposto(p)?.id === l.id).length;
        return (
          <div key={l.id} className="scheda-linea">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontWeight: 700, margin: 0 }}>{l.nome}</p>
                <p className="percorso-linea">{l.fermate.length > 0 ? l.fermate.map((f, i) => <span key={f.fermataId}>{i > 0 && <i aria-hidden="true">→</i>}{f.citta}</span>) : 'Nessuna fermata'}</p>
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '4px 0 0' }}>
                  {plurale(l.bus.length, 'bus', 'bus')} · {anteprima ? `${occupatiLinea} / ${plurale(postiLinea, 'posto occupato', 'posti occupati')}` : plurale(postiLinea, 'posto', 'posti')}
                  {proposteSuLinea > 0 && <> · {proposteSuLinea === 1 ? '1 bus da confermare' : `${proposteSuLinea} bus da confermare`}</>}
                </p>
                {postiLinea > 0 && anteprima && <BarraPosti occupati={occupatiLinea} posti={postiLinea} />}
              </div>
              <MenuAzioni etichetta={`Azioni su ${l.nome}`} voci={[
                { testo: 'Modifica percorso', onClick: () => apriModificaPercorso(l) },
                { testo: 'Elimina linea', onClick: () => eliminaLinea(l), pericolosa: true },
              ]} />
            </div>

            {pannello?.tipo === 'modifica-percorso' && pannello.lineaId === l.id && (
              <div className="pannello-in-linea">
                <p style={{ fontWeight: 700, marginBottom: 6 }}>Modifica percorso (vale per tutti i bus della linea)</p>
                {fermateAttive.map((f) => (
                  <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 'var(--testo-base)' }}>
                    <input
                      type="checkbox"
                      checked={percorsoModificato.includes(f.id)}
                      onChange={(e) => setPercorsoModificato((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))}
                    />
                    {f.citta} {f.orario && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({f.orario})</span>}
                  </label>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn btn-primary btn-piccolo" onClick={() => salvaModificaPercorso(l.id)} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva percorso'}</button>
                  <button type="button" className="btn btn-ghost btn-piccolo" onClick={chiudiPannello}>Annulla</button>
                </div>
              </div>
            )}

            {l.bus.length === 0 && <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '10px 0 0' }}>Nessun bus su questa linea.</p>}
            {l.bus.map((b) => {
              const previsione = anteprimaPerBus.get(b.id);
              const fornitoreNome = fornitori.find((f) => f.id === b.fornitoreId)?.nome;
              return (
                <div key={b.id}>
                  <div className="riga-bus">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        {b.riferimento}{' '}
                        <span className="posti-bus">
                          {b.postiBus == null ? 'posti non indicati' : previsione ? `${previsione.passeggeri} / ${plurale(b.postiBus, 'posto', 'posti')}` : plurale(b.postiBus, 'posto', 'posti')}
                        </span>
                      </p>
                      {previsione && b.postiBus != null && b.postiBus > 0 && <BarraPosti occupati={previsione.passeggeri} posti={b.postiBus} />}
                      {previsione && (
                        <p style={{ margin: '4px 0 0', fontSize: 'var(--testo-sm)' }}>
                          {previsione.passeggeri === 0
                            ? (anteprima?.giaSmistato ? 'Nessuno sul bus' : 'Nessuno previsto dallo smistamento')
                            : <>{anteprima?.giaSmistato ? 'Sul bus' : 'Previsti'}: {previsione.perFermata.map((x) => `${x.citta} ${x.passeggeri}`).join(' · ')}{previsione.etaMedia != null ? ` · età media ${Math.round(previsione.etaMedia)}` : ''}</>}
                        </p>
                      )}
                      <p style={{ margin: '2px 0 0', fontSize: 'var(--testo-sm)', color: 'var(--mist)' }}>
                        {[fornitoreNome, b.autistaNome && `autista ${b.autistaNome}`, b.tourLeaderNome ? `tour leader ${b.tourLeaderNome}` : 'nessun tour leader'].filter(Boolean).join(' · ')}
                      </p>
                      {b.preventivo && <PreventivoDelBusRiga preventivo={b.preventivo} onCambiato={ricarica} />}
                      {costoQuotazione != null && b.costo != null && Number(b.costo) > costoQuotazione && (
                        <p style={{ margin: '2px 0 0', fontSize: 'var(--testo-sm)', color: '#b45309' }}>Costa {formattaEuro(Number(b.costo) - costoQuotazione)} più della quotazione usata per i prezzi.</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => apriPasseggeri(l.id, b.id)}>Passeggeri</button>
                      <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => apriModificaBus(l.id, b)}>Modifica</button>
                      <MenuAzioni etichetta={`Azioni sul bus ${b.riferimento}`} voci={[{ testo: 'Rimuovi bus', onClick: () => rimuoviBus(l, b), pericolosa: true }]} />
                    </div>
                  </div>

                  {pannello?.tipo === 'modifica-bus' && pannello.busId === b.id && (
                    <div className="pannello-in-linea">
                      <p style={{ fontWeight: 700, marginBottom: 8 }}>Modifica bus {b.riferimento}</p>
                      {campiBus(false)}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button type="button" className="btn btn-primary btn-piccolo" onClick={() => salvaModificaBus(b.id)} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva bus'}</button>
                        <button type="button" className="btn btn-ghost btn-piccolo" onClick={chiudiPannello}>Annulla</button>
                      </div>
                    </div>
                  )}

                  {pannello?.tipo === 'passeggeri' && pannello.busId === b.id && (
                    <div className="pannello-in-linea">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontWeight: 700, margin: 0 }}>Passeggeri del bus {b.riferimento}</p>
                        <button type="button" className="btn btn-ghost btn-piccolo" disabled={scaricandoPdfId === b.id} onClick={() => scaricaPdfPasseggeri(b)}>{scaricandoPdfId === b.id ? 'Preparo il PDF…' : 'Scarica PDF'}</button>
                      </div>
                      {errorePasseggeri ? (
                        <p style={{ color: 'var(--pink)', margin: 0 }}>{errorePasseggeri}</p>
                      ) : passeggeri === null ? (
                        <p style={{ color: 'var(--mist)', margin: 0 }}>Carico…</p>
                      ) : passeggeri.length === 0 ? (
                        <p style={{ color: 'var(--mist)', margin: 0 }}>
                          {anteprima?.giaSmistato ? 'Nessun passeggero su questo bus.' : `La lista si riempie con lo smistamento per età${anteprima?.smistamentoIl ? `, il ${formattaDataOra(anteprima.smistamentoIl)}` : ', il giorno prima della partenza'}.`}
                        </p>
                      ) : (
                        <div className="table-scroll">
                          <table className="data-table" style={{ minWidth: 520 }}>
                            <thead><tr><th>Passeggero</th><th>Fermata</th><th style={{ textAlign: 'right' }}>Orario</th><th>Telefono</th><th>Salito</th></tr></thead>
                            <tbody>
                              {passeggeri.map((p) => (
                                <tr key={p.id}>
                                  <td>{p.cognome} {p.nome}<span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>{p.pnr}</span></td>
                                  <td>{p.fermata}</td>
                                  <td style={{ textAlign: 'right' }}>{p.orario ?? '—'}</td>
                                  <td>{p.telefono ?? '—'}</td>
                                  <td>{p.salito ? 'Sì' : 'No'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bus proposti in automatico su questa linea, sotto quelli confermati. */}
            {lineeDaConfermare.filter((p) => lineaDelBusProposto(p)?.id === l.id).map((p) => schedaProposta(p, percorso, l))}

            {pannello?.tipo === 'aggiungi-bus' && pannello.lineaId === l.id ? (
              <div className="pannello-in-linea">
                <p style={{ fontWeight: 700, marginBottom: 4 }}>Aggiungi bus a {l.nome}</p>
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginBottom: 10 }}>Fa le stesse fermate della linea.</p>
                {campiBus(true)}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn btn-primary btn-piccolo" onClick={() => salvaBusAggiunto(l.id)} disabled={salvando}>{salvando ? 'Salvo…' : 'Aggiungi bus'}</button>
                  <button type="button" className="btn btn-ghost btn-piccolo" onClick={chiudiPannello}>Annulla</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost btn-piccolo" style={{ marginTop: 10 }} onClick={() => apriAggiungiBus(l.id)}>+ Aggiungi bus</button>
            )}
          </div>
        );
      })}

      {modaleLinea && modaleLinea.tipo === 'conferma' && modaleLinea.linea.busPerLinea && (
        // Bus in più su una linea che c'è: un passo solo, le fermate sono quelle della linea.
        <Modale titolo={`Conferma ${modaleLinea.linea.nome}`} onClose={() => { setModaleLinea(null); setRispostaScelta(null); }} larga>
          <p className="testo-intro" style={{ marginTop: -4 }}>
            Il bus va su {modaleLinea.linea.busPerLinea.nome}, con le stesse fermate. {testoDatiBus}
          </p>
          {campiBus(true)}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setModaleLinea(null); setRispostaScelta(null); }}>Annulla</button>
            <button type="button" className="btn btn-primary" onClick={salvaLinea} disabled={salvando}>{salvando ? 'Salvo…' : 'Conferma il bus'}</button>
          </div>
        </Modale>
      )}
      {modaleLinea && !(modaleLinea.tipo === 'conferma' && modaleLinea.linea.busPerLinea) && (
        <Modale titolo={`${modaleLinea.tipo === 'conferma' ? `Conferma ${nomeProposta(modaleLinea.linea)}` : 'Nuova linea'} — passo ${stepLinea} di 2`} onClose={() => { setModaleLinea(null); setRispostaScelta(null); }} larga>
          {stepLinea === 1 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>
                {modaleLinea.tipo === 'conferma'
                  ? `Dati del bus. ${testoDatiBus}`
                  : 'Dati del primo bus della linea.'}
              </p>
              {campiBus(true)}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setModaleLinea(null); setRispostaScelta(null); }}>Annulla</button>
                <button
                  type="button" className="btn btn-primary"
                  onClick={() => {
                    if (!formBus.riferimento?.trim() || !formBus.postiBus) { notifica('Indica un riferimento per il bus e quanti posti ha.', 'errore'); return; }
                    setStepLinea(2);
                  }}
                >
                  Avanti: scegli le fermate
                </button>
              </div>
            </>
          )}
          {stepLinea === 2 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>
                {modaleLinea.tipo === 'conferma'
                  ? "Le fermate della linea: di solito tutte, lo smistamento divide i passeggeri per età tra i bus. L'ordine lo decide l'orario di ciascuna."
                  : "Scegli le fermate in qualsiasi ordine: l'ordine finale lo decide l'orario di ciascuna."}
              </p>
              {fermateAttive.map((f) => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 'var(--testo-base)' }}>
                  <input
                    type="checkbox"
                    checked={fermateSelezionate.includes(f.id)}
                    onChange={(e) => setFermateSelezionate((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))}
                  />
                  {f.citta} {f.orario && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({f.orario})</span>}
                  <span style={{ marginLeft: 'auto', color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>{plurale(prenotatiPerFermata.get(f.id) ?? 0, 'prenotato', 'prenotati')}</span>
                </label>
              ))}
              {!!suggerimento?.fermateSenzaPrenotazioni?.length && (
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--amber)', marginTop: 8 }}>
                  Senza prenotazioni: {suggerimento.fermateSenzaPrenotazioni.map((f) => f.citta).join(', ')}. Se vuoi accorciare il tragitto, lasciale fuori.
                </p>
              )}
              {fermateSelezionate.length > 0 && (
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginTop: 10 }}>
                  Ordine finale: {[...fermateAttive].filter((f) => fermateSelezionate.includes(f.id)).sort(perOrario).map((f) => f.citta).join(' → ')}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStepLinea(1)}>← Dati del bus</button>
                <button type="button" className="btn btn-primary" onClick={salvaLinea} disabled={salvando}>
                  {salvando ? 'Salvo…' : modaleLinea.tipo === 'conferma' ? 'Conferma la linea' : 'Crea la linea'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </div>
  );
}
