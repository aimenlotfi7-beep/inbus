import { useEffect, useState, type ReactNode } from 'react';
import { notifica } from '../shared/notifiche';
import { conferma } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { confermaAvvisiClienti, notificaEsitoAvvisi } from '../shared/avvisiClienti';
import { Modale } from '../shared/Modale';
import { MenuAzioni } from '../shared/MenuAzioni';
import {
  eventiApi, type Linea, type BusDiLinea, type BusDiLineaInput, type SuggerimentoLinea, type CalcoloBusTragitto,
  type RiepilogoEconomicoTratta, type AnteprimaSmistamento, type PasseggeroBus,
} from '../../api/eventi';
import type { Evento, Fermata } from '../../api/types';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { preventiviApi } from '../../api/preventivi';
import { tourLeaderApi, type TourLeader } from '../../api/tourleader';
import { haPermesso } from '../../api/auth';
import { CampoNumero } from '../shared/CampoNumero';
import { PanelHead } from '../shared/PanelHead';
import { useNavigazione } from '../shared/NavigazioneContext';
import { useSessione } from '../shared/SessioneContext';
import { formattaData, formattaDataOra, formattaEuro, plurale } from '../../shared/formato';
import { SEZIONE_PARTENZE, type TabPartenze } from './partenze/tipi';

const BUS_VUOTO: BusDiLineaInput = { riferimento: '' };

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
 *  Una "linea" è un CONTENITORE: un percorso (quali fermate copre) che
 *  può avere uno o più bus dentro. Linee diverse dello stesso tragitto
 *  possono coprire fermate diverse. */
export function LineeTragittoScreen(props?: { eventoIdProp?: string; tragittoIdProp?: string; incorporata?: boolean; onModificato?: () => void }) {
  const navigaSezione = useNavigazione();
  const sessione = useSessione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
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
  const [stepLinea, setStepLinea] = useState<1 | 2>(1);
  const [formBus, setFormBus] = useState<BusDiLineaInput & { postiBus?: number }>(BUS_VUOTO);
  const [fermateSelezionate, setFermateSelezionate] = useState<string[]>([]);
  const [percorsoModificato, setPercorsoModificato] = useState<string[]>([]);
  const [verificaKm, setVerificaKm] = useState<{ kmAccettati: number | null; kmAttuali: number | null; cambiatoParecchio: boolean } | null>(null);
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
    eventiApi.suggerimentoLinea(tragittoId).then(setSuggerimento).catch(() => setSuggerimento(null));
    eventiApi.anteprimaSmistamento(tragittoId).then(setAnteprima).catch(() => setAnteprima(null));
    if (vedeEconomia) eventiApi.riepilogoEconomico(eventoId).then(setEconomia).catch(() => setEconomia([]));
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
  const tuttiIBus = lineeConfermate.flatMap((l) => l.bus);
  const postiSuiBus = tuttiIBus.reduce((tot, b) => tot + (b.postiBus ?? 0), 0);
  const postiPrevistiPerLinea = tragittoVero.preventivoPostiBus;
  const datiEconomia = economia.find((e) => e.tragittoId === idTragitto);
  const anteprimaPerBus = new Map((anteprima?.linee ?? []).flatMap((l) => l.bus).map((b) => [b.busId, b]));
  const giorniAllEvento = Math.ceil((new Date(evento.data).getTime() - Date.now()) / 86400000);
  const testoGiorni = giorniAllEvento < 0 ? 'Passato' : giorniAllEvento === 0 ? 'Oggi' : giorniAllEvento === 1 ? 'Domani' : `Tra ${giorniAllEvento} giorni`;
  // Dati del preventivo accettato (fornitore, posti, costo): per una linea
  // nuova o da confermare resta da scrivere solo la targa.
  const busDalPreventivo: BusDiLineaInput & { postiBus?: number } = {
    riferimento: '',
    fornitoreId: tragittoVero.fornitoreId ?? undefined,
    postiBus: tragittoVero.preventivoPostiBus ?? undefined,
    costo: tragittoVero.preventivoCosto ? Number(tragittoVero.preventivoCosto) : undefined,
  };

  /** Quanti passeggeri sono già sui bus, per città, sommando tutte le linee. */
  function suiBusPerCitta(citta: string) {
    return linee.reduce((tot, l) => tot + (l.fermate.find((x) => x.citta === citta)?.versati ?? 0), 0);
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
      aggiornaDopoModifica();
      preventiviApi.verificaKm(idTragitto).then(setVerificaKm).catch(() => {});
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
    setFormBus(BUS_VUOTO);
    setFermateSelezionate([]);
    setStepLinea(1);
    chiudiPannello();
    setModaleLinea({ tipo: 'nuova' });
  }
  /** Dai dati del preventivo accettato e con tutte le fermate attive già
   *  scelte: resta da scrivere solo la targa. */
  function apriNuovaLineaDaSuggerimento() {
    setFormBus(busDalPreventivo);
    setFermateSelezionate(fermateAttive.map((f) => f.id));
    setStepLinea(1);
    chiudiPannello();
    setModaleLinea({ tipo: 'nuova' });
  }
  /** Conferma di una linea da confermare: dati del preventivo e le fermate
   *  della linea (solo quelle ancora attive, le altre non si possono scegliere). */
  function apriConfermaLinea(linea: Linea) {
    setFormBus(busDalPreventivo);
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
        ? await eventiApi.confermaLinea(modaleLinea.linea.id, input)
        : await eventiApi.creaLinea(idEvento, input);
      const fatto = modaleLinea.tipo === 'conferma' ? `${modaleLinea.linea.nome} confermata` : 'Linea creata';
      setModaleLinea(null);
      // Con la prima linea confermata la partenza diventa confermata e chi
      // ha prenotato riceve l'email: il messaggio dice com'è andata.
      if (esito.partenzaConfermata) notificaEsitoAvvisi(`${fatto} e partenza confermata`, esito);
      else notifica(`${fatto}.`, 'successo');
      if (esito.tourLeaderAvvisato !== null) notifica(esito.tourLeaderAvvisato ? 'Il tour leader è stato avvisato via email.' : "L'email al tour leader non è partita: avvisalo tu.", esito.tourLeaderAvvisato ? 'successo' : 'errore');
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
    const ok = await conferma({
      titolo: `Eliminare ${linea.nome}?`,
      testo: <>{linea.bus.length === 0 ? 'Viene tolta la linea, che non ha bus.' : `Vengono tolti la linea e ${linea.bus.length === 1 ? 'il suo bus' : `i suoi ${linea.bus.length} bus`}.`} I passeggeri già assegnati tornano in attesa e verranno smistati di nuovo sulle altre linee.</>,
      conferma: 'Elimina linea',
      pericolosa: true,
    });
    if (!ok) return;
    try {
      await eventiApi.eliminaLinea(linea.id);
      chiudiPannello();
      notifica(`${linea.nome} eliminata.`, 'successo');
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
      await eventiApi.aggiornaPercorsoLinea(idEvento, lineaId, percorsoModificato);
      chiudiPannello();
      notifica('Percorso della linea aggiornato.', 'successo');
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
    const margine = datiEconomia.incassato - costoTotale;
    return (
      <p className="nota-margine" style={{ color: margine >= 0 ? 'var(--green)' : 'var(--pink)' }}>
        Incassati {formattaEuro(datiEconomia.incassato)} · costo dei bus {formattaEuro(costoTotale)} · margine {formattaEuro(margine)}{margine < 0 ? ' (per ora in perdita)' : ''}
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
          <select value={formBus.fornitoreId ?? ''} onChange={(e) => setFormBus({ ...formBus, fornitoreId: e.target.value || undefined })}>
            <option value="">— Nessuno —</option>
            {fornitoriScegliibili(formBus.fornitoreId).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.stato !== 'APPROVATO' ? ' (non attivo)' : ''}</option>)}
          </select>
        </label>
        <label>Tour leader (facoltativo)
          <select value={formBus.tourLeaderId ?? ''} onChange={(e) => setFormBus({ ...formBus, tourLeaderId: e.target.value || null })}>
            <option value="">— Nessuno —</option>
            {tourLeaders.map((t) => <option key={t.id} value={t.id}>{t.nome} {t.cognome}</option>)}
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
  const mancanoPosti = lineeConfermate.length > 0 ? passeggeriTotali - postiSuiBus : 0;
  const mancantiAlPareggio = suggerimento?.postiDiPareggio != null ? Math.max(0, Math.ceil(suggerimento.postiDiPareggio - suggerimento.totaleConfermati)) : null;
  if (lineeDaConfermare.length > 0) {
    const prima = lineeDaConfermare[0];
    prossimoPasso = {
      tono: 'azione',
      titolo: lineeDaConfermare.length === 1 ? `${prima.nome} da confermare` : `${lineeDaConfermare.length} linee da confermare`,
      testo: lineeConfermate.length === 0
        ? 'Le prenotazioni hanno raggiunto la soglia di pareggio: inserisci i dati del bus per confermare la linea. Fornitore, posti e costo arrivano dal preventivo.'
        : 'I passeggeri hanno riempito i posti dei bus confermati: inserisci i dati del prossimo bus. Intanto le vendite continuano.',
      azione: { testo: `Conferma ${prima.nome}`, onClick: () => apriConfermaLinea(prima) },
    };
  } else if (lineeConfermate.length === 0) {
    prossimoPasso = suggerimento?.pronta
      ? { tono: 'azione', titolo: 'Pronta da confermare', testo: 'Le prenotazioni coprono il costo: crea la linea, i dati del preventivo sono già pronti.', azione: { testo: 'Crea la linea', onClick: apriNuovaLineaDaSuggerimento } }
      : {
        tono: 'info',
        titolo: 'Nessuna linea ancora',
        testo: mancantiAlPareggio
          ? `Mancano ${plurale(mancantiAlPareggio, 'passeggero', 'passeggeri')} alla soglia di pareggio: a quel punto la linea da confermare si crea da sola. Se vuoi, puoi crearla già adesso.`
          : 'La linea da confermare si crea da sola quando le prenotazioni raggiungono la soglia di pareggio.',
        azione: { testo: 'Crea la linea', onClick: apriNuovaLinea },
      };
  } else if (mancanoPosti > 0) {
    prossimoPasso = { tono: 'avviso', titolo: mancanoPosti === 1 ? 'Manca 1 posto' : `Mancano ${mancanoPosti} posti`, testo: 'I passeggeri confermati sono più dei posti sui bus: aggiungi un bus a una linea.', azione: { testo: 'Aggiungi un bus', onClick: () => apriAggiungiBus(lineeConfermate[0].id) } };
  } else if (anteprima && anteprima.senzaPosto.passeggeri > 0) {
    prossimoPasso = { tono: 'avviso', titolo: `${anteprima.senzaPosto.passeggeri === 1 ? '1 passeggero resterebbe' : `${anteprima.senzaPosto.passeggeri} passeggeri resterebbero`} senza posto`, testo: 'La loro fermata non è in nessuna linea, oppure i bus che la coprono sono pieni.', azione: { testo: 'Crea una linea', onClick: apriNuovaLinea } };
  } else if (anteprima?.giaSmistato) {
    prossimoPasso = { tono: 'info', titolo: 'Passeggeri smistati', testo: 'I passeggeri sono sui bus: i clienti hanno ricevuto il biglietto e i tour leader vedono la lista.' };
  } else {
    prossimoPasso = { tono: 'info', titolo: 'Tutto pronto', testo: <>Lo smistamento per età parte {anteprima?.smistamentoIl ? `il ${formattaDataOra(anteprima.smistamentoIl)}` : 'il giorno prima della partenza'}: da quel momento i clienti ricevono il biglietto e i tour leader la lista dei passeggeri.</> };
  }

  const pareggio = suggerimento?.postiDiPareggio != null ? `${suggerimento.totaleConfermati} / ${Math.ceil(suggerimento.postiDiPareggio)}` : '—';

  return (
    <div>
      {!incorporata && (
        <>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => tornaAPartenze()}>← Torna a Partenze</button>
          <PanelHead titolo={`Linee — ${tragittoVero.nome}`} />
          <p className="testo-intro" style={{ marginTop: -10 }}>{evento.artista} · {formattaData(evento.data)}</p>
        </>
      )}

      <div className="riepilogo-numeri">
        <div className="riepilogo-numero"><span>Passeggeri</span><b>{passeggeriTotali}</b></div>
        <div className="riepilogo-numero"><span>Posti sui bus</span><b>{postiSuiBus}</b></div>
        <div className="riepilogo-numero"><span>Pareggio</span><b>{pareggio}</b></div>
        <div className="riepilogo-numero"><span>Evento</span><b>{testoGiorni}</b></div>
        {vedeEconomia && datiEconomia && (
          <div className="riepilogo-numero">
            <span>Margine</span>
            <b style={{ color: datiEconomia.costoCensito ? (datiEconomia.guadagno >= 0 ? 'var(--green)' : 'var(--pink)') : undefined }}>
              {datiEconomia.costoCensito ? formattaEuro(datiEconomia.guadagno) : '—'}
            </b>
          </div>
        )}
      </div>

      {verificaKm?.cambiatoParecchio && (
        <div className="prossimo-passo avviso">
          <div>
            <p className="titolo">Le fermate sono cambiate parecchio</p>
            <p>Da quando hai accettato il preventivo: circa {Math.round(verificaKm.kmAccettati!)} km allora, {Math.round(verificaKm.kmAttuali!)} km ora. Potrebbe servire un nuovo preventivo.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => tornaAPartenze('preventivi')}>Vai a Preventivi →</button>
        </div>
      )}

      <div className={`prossimo-passo ${prossimoPasso.tono}`} role={prossimoPasso.tono === 'avviso' ? 'alert' : undefined}>
        <div>
          <p className="titolo">{prossimoPasso.titolo}</p>
          <p>{prossimoPasso.testo}</p>
        </div>
        {prossimoPasso.azione && <button type="button" className="btn btn-primary" onClick={prossimoPasso.azione.onClick}>{prossimoPasso.azione.testo}</button>}
      </div>

      <p className="section-label" style={{ marginBottom: 8 }}>Fermate</p>
      <div className="tabella-righe">
        <div className="riga intestazione"><span>Fermata</span><span className="num">Orario</span><span className="num">Prenotati</span><span className="num">Sui bus</span><span /></div>
        {tutteLeFermateOrdinate.length === 0 && <div className="riga"><span style={{ color: 'var(--mist)' }}>Nessuna fermata su questo tragitto.</span></div>}
        {tutteLeFermateOrdinate.map((f) => (
          <div key={f.id} className={`riga${f.attivo ? '' : ' spenta'}`}>
            <span style={{ minWidth: 0 }}>{f.citta}{!f.attivo && <span style={{ fontSize: 'var(--testo-sm)' }}> · esclusa</span>}</span>
            <span className="num">{f.orario ?? '—'}</span>
            <span className="num">{prenotatiPerFermata.get(f.id) ?? 0}</span>
            <span className="num">{suiBusPerCitta(f.citta)}</span>
            <span style={{ textAlign: 'right' }}>
              {fermataInSalvataggio === f.id ? '…' : (
                <MenuAzioni etichetta={`Azioni sulla fermata di ${f.citta}`} voci={[f.attivo
                  ? { testo: 'Escludi la fermata', onClick: () => alternaFermataAttiva(f) }
                  : { testo: 'Riattiva la fermata', onClick: () => alternaFermataAttiva(f) }]} />
              )}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <p className="section-label" style={{ margin: 0 }}>Linee</p>
        <button type="button" className="btn btn-ghost btn-piccolo" onClick={apriNuovaLinea}>+ Nuova linea</button>
      </div>

      {linee.length === 0 && <p className="testo-intro">Nessuna linea ancora per questo tragitto.</p>}
      {linee.map((l) => {
        const percorso = l.fermate.map((f) => f.citta).join(' → ');

        // Linea da confermare: nessun bus, un solo pulsante per confermarla.
        if (l.daConfermare) {
          const motivo = lineeConfermate.length === 0 && lineeDaConfermare[0]?.id === l.id
            ? 'Creata in automatico: le prenotazioni hanno raggiunto la soglia di pareggio.'
            : 'Creata in automatico: i passeggeri hanno riempito i posti delle altre linee.';
          return (
            <div key={l.id} className="scheda-linea da-confermare">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>{l.nome} <span className="badge attenzione" style={{ marginLeft: 4 }}>Da confermare</span></p>
                  <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '2px 0 0' }}>
                    {percorso || 'Nessuna fermata'}{postiPrevistiPerLinea ? ` · ${plurale(postiPrevistiPerLinea, 'posto previsto', 'posti previsti')}` : ''}
                  </p>
                </div>
                <button type="button" className="btn btn-primary btn-piccolo" onClick={() => apriConfermaLinea(l)}>Conferma linea</button>
              </div>
              <p style={{ fontSize: 'var(--testo-md)', margin: '10px 0 0' }}>{motivo} Inserisci i dati del bus per confermarla: da quel momento lo smistamento per età ci mette i passeggeri.</p>
              {lineeConfermate.length > 0 && (
                <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', margin: '6px 0 0' }}>Preferisci un bus in più su una linea già confermata? Aggiungilo lì: questa linea sparisce da sola.</p>
              )}
            </div>
          );
        }

        const prenotazioniLinea = l.fermate.reduce((tot, f) => tot + f.inAttesa + f.versati, 0);
        const postiLinea = l.bus.reduce((tot, b) => tot + (b.postiBus ?? 0), 0);
        return (
          <div key={l.id} className="scheda-linea">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, margin: 0 }}>{l.nome}</p>
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '2px 0 0' }}>
                  {percorso || 'Nessuna fermata'} · {plurale(prenotazioniLinea, 'passeggero', 'passeggeri')} · {plurale(postiLinea, 'posto', 'posti')}
                </p>
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
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{b.riferimento} · {b.postiBus != null ? plurale(b.postiBus, 'posto', 'posti') : 'posti non indicati'}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 'var(--testo-sm)', color: 'var(--mist)' }}>
                        {[fornitoreNome, b.autistaNome && `autista ${b.autistaNome}`, b.tourLeaderNome ? `tour leader ${b.tourLeaderNome}` : 'nessun tour leader'].filter(Boolean).join(' · ')}
                      </p>
                      {previsione && (
                        <p style={{ margin: '2px 0 0', fontSize: 'var(--testo-sm)' }}>
                          {anteprima?.giaSmistato ? 'Sul bus' : 'Previsti dallo smistamento'}: {plurale(previsione.passeggeri, 'passeggero', 'passeggeri')}{previsione.etaMedia != null ? ` · età media ${Math.round(previsione.etaMedia)}` : ''}
                        </p>
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

      {modaleLinea && (
        <Modale titolo={`${modaleLinea.tipo === 'conferma' ? `Conferma ${modaleLinea.linea.nome}` : 'Nuova linea'} — passo ${stepLinea} di 2`} onClose={() => setModaleLinea(null)} larga>
          {stepLinea === 1 && (
            <>
              <p className="testo-intro" style={{ marginTop: -4 }}>
                {modaleLinea.tipo === 'conferma'
                  ? 'Dati del bus che farà questa linea: fornitore, posti e costo arrivano dal preventivo, controllali e scrivi la targa.'
                  : 'Dati del primo bus della linea.'}
              </p>
              {campiBus(true)}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModaleLinea(null)}>Annulla</button>
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
