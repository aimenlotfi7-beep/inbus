import { useEffect, useRef, useState } from 'react';
import { notifica } from '../../shared/notifiche';
import { conferma } from '../../shared/conferma';
import { motivoErrore, ERRORE_MAPPE } from '../../shared/errori';
import { confermaAvvisiClienti, notificaEsitoAvvisi } from '../../shared/avvisiClienti';
import { CampoNumero } from '../../shared/CampoNumero';
import { formattaEuro, plurale } from '../../../shared/formato';
import type { ContestoPartenze } from './tipi';
import { eventiApi, type CalcoloBusTragitto, type BusFisico, type RiepilogoEconomicoTratta, type FermataInput, type Linea } from '../../../api/eventi';
import type { Evento, Tragitto } from '../../../api/types';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { impostazioniApi } from '../../../api/impostazioni';
import { PreventiviTragitto } from './PreventiviTragitto';
import { LineeTragittoScreen } from '../LineeTragittoScreen';
import { fornitoriApi, type Fornitore } from '../../../api/fornitori';
import { OrarioInput } from '../../shared/OrarioInput';
import { useSessione } from '../../shared/SessioneContext';
import { useNavigazione } from '../../shared/NavigazioneContext';
import { geocodifica, durataViaggio, distanzaViaggio, attesa } from '../../shared/geo';
import { haPermesso } from '../../../api/auth';
import { InfoTooltip } from '../../shared/InfoTooltip';
import { TOOLTIP_DEFAULT } from '../../tooltipDefaults';
import { useMappaTooltip } from '../../shared/useMappaTooltip';

/** Un messaggio sotto un calcolo (orari, prezzi): neutro mentre lavora o
 *  quando informa, rosso solo quando c'è qualcosa da sistemare. */
type StatoCalcolo = { testo: string; tipo: 'info' | 'errore' };

type PrezzoFermata = {
  fermataId: string;
  citta: string;
  /** km fino all'arrivo; null finché non si calcola. */
  distanza: number | null;
  /** Indirizzo non trovato sulla mappa: il prezzo va scritto a mano. */
  nonTrovata?: boolean;
  prezzo: number | undefined;
};

/** Un solo indicatore di stato per tragitto, con le stesse parole delle
 *  card in elenco (PartenzeScreen): rosso se mancano posti (il problema
 *  più urgente, ha sempre la precedenza), arancio se serve ancora
 *  qualcosa, verde se è a posto. Niente simboli: il colore basta. */
function statoTragitto(tragitto: CalcoloBusTragitto) {
  // Finché i prezzi non sono salvati il tragitto non è nemmeno in
  // vendita (non può avere prenotazioni): gli altri controlli non hanno
  // ancora senso.
  if (tragitto.stato === 'DA_CONFERMARE') return { classe: 'attenzione', etichetta: 'Da prezzare, non ancora in vendita' };
  const mancanti = tragitto.totalePasseggeri - tragitto.postiTotali;
  if (mancanti > 0) return { classe: 'non-coperta', etichetta: mancanti === 1 ? 'Manca 1 posto' : `Mancano ${mancanti} posti` };
  if (tragitto.stato === 'CONFERMATO') return { classe: 'coperta', etichetta: 'Confermata' };
  return { classe: 'attenzione', etichetta: 'Serve una linea' };
}

function classeBadge(classe: string) {
  return classe === 'coperta' ? 'badge-stato-verde' : classe === 'attenzione' ? 'badge-stato-arancio' : classe === 'non-coperta' ? 'badge-stato-rosso' : classe;
}

/** Sezione "Partenze" di un singolo evento: riepilogo generale, calcolo
 *  bus necessari, copertura tratte, censimento bus fisici. Va dentro la
 *  scheda dell'evento (tab). */
export function PartenzeTab({ eventoId, servizi, contestoPartenze, onSalvato, onModificheInCorso }: {
  eventoId: string;
  servizi?: { key: string; nome: string }[];
  // Arrivando da una card di Partenze (raggruppata per evento, che può
  // comparire in più tab insieme se le sue parti sono in stati
  // diversi) — quali tragitti sono rilevanti per QUESTO contesto
  // specifico (filtra i servizi mostrati a solo quelli coinvolti) e
  // quale azione eseguire subito sul primo di loro.
  contestoPartenze?: ContestoPartenze | null;
  // Avvisa il componente che ha aperto questa scheda (risale fino a
  // PartenzeScreen) dopo OGNI salvataggio fatto qui dentro — altrimenti
  // la lista/cache lì fuori resta con dati vecchi.
  onSalvato?: () => void;
  /** Vero finché un editor (orari o prezzi) ha modifiche non salvate: la
   *  scheda che contiene questa sezione chiede conferma prima di uscire. */
  onModificheInCorso?: (inCorso: boolean) => void;
}) {
  const sessione = useSessione();
  const mappaTooltip = useMappaTooltip();
  const navigaSezione = useNavigazione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
  const puoAccettarePreventivi = haPermesso(sessione, 'preventivi.accetta');
  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [eventoCompleto, setEventoCompleto] = useState<Evento | null>(null);
  // Mappa tragittoId -> form in modifica — non più un solo tragitto alla
  // volta: un evento con più servizi/percorsi nello stesso contesto (es.
  // "Orari") deve poter avere PIÙ pannelli aperti insieme.
  const [formOperativoMap, setFormOperativoMap] = useState<Map<string, { prezzoExtra: number; fermate: FermataInput[] }>>(new Map());
  // Come erano all'apertura: serve a capire se ci sono modifiche da perdere.
  const [formOperativoInizialeMap, setFormOperativoInizialeMap] = useState<Map<string, string>>(new Map());
  // Chiave composita `${tragittoId}::${idx}` — quale riga fermata ha
  // l'indirizzo espanso (doppio tap/clic sulla città).
  const [fermateIndirizzoEspanso, setFermateIndirizzoEspanso] = useState<Set<string>>(new Set());
  const [salvandoOperativoSet, setSalvandoOperativoSet] = useState<Set<string>>(new Set());
  const [calcolandoOrariSet, setCalcolandoOrariSet] = useState<Set<string>>(new Set());
  const [statoCalcoloOrariMap, setStatoCalcoloOrariMap] = useState<Map<string, StatoCalcolo>>(new Map());
  // Pannello prezzi di vendita, per tragittoId (più tragitti possono
  // essere aperti insieme nella stessa pagina).
  const [formPreventivoMap, setFormPreventivoMap] = useState<Map<string, { costo?: number; postiBus?: number; fornitoreId?: string }>>(new Map());
  const [fornitoriLista, setFornitoriLista] = useState<Fornitore[]>([]);
  const [fornitoriNonDisponibili, setFornitoriNonDisponibili] = useState(false);
  // La soglia della formula prezzi, configurabile da Impostazioni. Se non
  // si riesce a leggere si usa il default, ma lo si dice: prima il calcolo
  // usava il 50% in silenzio.
  const [sogliaOccupazionePercento, setSogliaOccupazionePercento] = useState(50);
  const [sogliaNonLetta, setSogliaNonLetta] = useState(false);
  const [prezziCalcolatiMap, setPrezziCalcolatiMap] = useState<Map<string, PrezzoFermata[]>>(new Map());
  const [prezziInizialiMap, setPrezziInizialiMap] = useState<Map<string, string>>(new Map());
  const [calcolandoPreventivoSet, setCalcolandoPreventivoSet] = useState<Set<string>>(new Set());
  const [statoCalcoloPreventivoMap, setStatoCalcoloPreventivoMap] = useState<Map<string, StatoCalcolo>>(new Map());
  const [salvandoPreventivoSet, setSalvandoPreventivoSet] = useState<Set<string>>(new Set());
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [economia, setEconomia] = useState<RiepilogoEconomicoTratta[]>([]);
  const [fermateAnagrafica, setFermateAnagrafica] = useState<FermataAnagrafica[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  // Quale tragitto è "attivo" quando si arriva da una card con più di
  // uno insieme (es. andata+ritorno) — una tab a testa invece di
  // vederli tutti impilati in una pagina lunga.
  const [tabTragittoAttivo, setTabTragittoAttivo] = useState<string | null>(null);
  // Caricate su richiesta, solo per i tragitti espansi nel riepilogo a
  // righe (Confermate/Passate).
  const [lineePerTragitto, setLineePerTragitto] = useState<Map<string, Linea[] | 'errore'>>(new Map());
  function caricaLineeSeServe(tragittoId: string) {
    if (lineePerTragitto.has(tragittoId)) return;
    eventiApi.listaLinee(tragittoId)
      .then((l) => setLineePerTragitto((prev) => new Map(prev).set(tragittoId, l)))
      .catch(() => setLineePerTragitto((prev) => new Map(prev).set(tragittoId, 'errore')));
  }
  // Se l'evento ha più servizi, questa sezione si comporta come se
  // ognuno fosse un evento a parte: una tab per servizio (più una per i
  // tragitti liberi, se ce ne sono).
  const [servizioAttivo, setServizioAttivo] = useState<string | 'liberi'>(servizi?.[0]?.key ?? 'liberi');

  // "Carico…" solo la prima volta: dopo un salvataggio i dati si
  // aggiornano sotto gli occhi, senza smontare la pagina (prima si
  // perdevano pannelli aperti e posizione dello scorrimento).
  function ricarica() {
    Promise.all([
      eventiApi.calcolaBus(eventoId),
      eventiApi.listaBus(eventoId),
      vedeEconomia ? eventiApi.riepilogoEconomico(eventoId) : Promise.resolve([]),
      eventiApi.getById(eventoId),
    ])
      .then(([c, b, e, ev]) => {
        setErrore('');
        setCalcolo(c);
        setBusLista(b);
        setEconomia(e);
        setEventoCompleto(ev);
        // Se c'è un solo tragitto, tanto vale aprirlo subito — altrimenti
        // partono tutti chiusi, per non dover scorrere un elenco lungo.
        setAperte((prev) => prev.size === 0 && c.length === 1 ? new Set([c[0].tragittoId]) : prev);
        // Il servizio scelto di default (il primo dell'elenco) potrebbe
        // non avere nessuna prenotazione — sposto la selezione sul primo
        // servizio che ne ha davvero.
        setServizioAttivo((attuale) => {
          const attualeHaPrenotazioni = attuale === 'liberi'
            ? c.some((l) => !l.servizioId && l.totalePasseggeri > 0)
            : c.some((l) => l.servizioId === attuale && l.totalePasseggeri > 0);
          if (attualeHaPrenotazioni) return attuale;
          const primoServizioConPrenotazioni = servizi?.find((v) => c.some((l) => l.servizioId === v.key && l.totalePasseggeri > 0));
          if (primoServizioConPrenotazioni) return primoServizioConPrenotazioni.key;
          if (c.some((l) => !l.servizioId && l.totalePasseggeri > 0)) return 'liberi';
          return attuale;
        });
      })
      .catch((e) => {
        const messaggio = `Impossibile caricare le partenze di questo evento: ${motivoErrore(e)}`;
        // Con i dati già a schermo basta un avviso; senza, la pagina non ha niente da mostrare.
        if (eventoCompleto) notifica(messaggio, 'errore'); else setErrore(messaggio);
      })
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then((f) => setFornitoriLista(f.filter((x) => x.stato === 'APPROVATO'))).catch(() => setFornitoriNonDisponibili(true));
    fermateAnagraficaApi.list().then(setFermateAnagrafica).catch(() => setFermateAnagrafica([]));
    // Letta da un indirizzo aperto a chi lavora in Partenze: prima serviva il
    // permesso delle Impostazioni, e senza si usava il 50% in silenzio.
    impostazioniApi.calcoloPrezzi().then(({ sogliaOccupazionePareggio }) => {
      if (Number.isFinite(sogliaOccupazionePareggio) && sogliaOccupazionePareggio > 0 && sogliaOccupazionePareggio <= 100) setSogliaOccupazionePercento(sogliaOccupazionePareggio);
    }).catch(() => setSogliaNonLetta(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

  function tragittoVeroDi(tragittoId: string): Tragitto | undefined {
    return eventoCompleto ? [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragittoId) : undefined;
  }
  function nomeFornitore(id: string | null | undefined) {
    if (!id) return 'Nessuno indicato';
    return fornitoriLista.find((f) => f.id === id)?.nome ?? (fornitoriNonDisponibili ? 'Nome non disponibile' : 'Fornitore non più attivo');
  }

  // Modifiche non salvate in un editor aperto (orari o prezzi).
  const modificheInCorso = [...formOperativoMap].some(([id, f]) => JSON.stringify(f) !== formOperativoInizialeMap.get(id))
    || [...formPreventivoMap.keys()].some((id) => JSON.stringify(prezziCalcolatiMap.get(id) ?? []) !== prezziInizialiMap.get(id));
  useEffect(() => { onModificheInCorso?.(modificheInCorso); }, [modificheInCorso, onModificheInCorso]);
  useEffect(() => () => onModificheInCorso?.(false), [onModificheInCorso]);

  // Atterraggio diretto da una card di Partenze — una volta sola,
  // appena i dati sono pronti (non ad ogni ricarica successiva,
  // altrimenti riaprirebbe il pannello anche dopo un salvataggio).
  const focusGestitoRef = useRef(false);
  useEffect(() => {
    if (focusGestitoRef.current || !contestoPartenze || !eventoCompleto || calcolo.length === 0) return;
    focusGestitoRef.current = true;
    setAperte((prev) => {
      const nuovo = new Set(prev);
      for (const id of contestoPartenze.tragittiIds) nuovo.add(id);
      return nuovo;
    });
    const primoTragittoId = contestoPartenze.tragittiIds[0];
    if (!primoTragittoId) return;
    const primoTragitto = tragittoVeroDi(primoTragittoId);
    if (primoTragitto) setServizioAttivo(primoTragitto.servizioId ?? 'liberi');
    if (contestoPartenze.azione === 'preventivo') for (const id of contestoPartenze.tragittiIds) apriPreventivo(id);
    if (contestoPartenze.azione === 'fermate') {
      for (const id of contestoPartenze.tragittiIds) {
        const calcoloTragitto = calcolo.find((c) => c.tragittoId === id);
        if (calcoloTragitto) apriModificaOperativa(calcoloTragitto);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestoPartenze, eventoCompleto, calcolo]);

  function toggleApertura(tragittoId: string) {
    setAperte((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(tragittoId)) nuovo.delete(tragittoId); else nuovo.add(tragittoId);
      return nuovo;
    });
  }

  /** Esporta le fermate di un tragitto in CSV (si apre in Excel) — da
   *  mandare al fornitore per farsi fare il preventivo: città,
   *  indirizzo e orario di ognuna. */
  function esportaFermateCsv(nomeTragitto: string, fermate: FermataInput[]) {
    const intestazione = ['Città', 'Indirizzo', 'Orario'];
    const escapeCsv = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const righeCsv = fermate.map((f) => [f.citta, f.indirizzo, f.orario ?? ''].map(escapeCsv).join(';'));
    const csv = '\uFEFF' + [intestazione.join(';'), ...righeCsv].join('\n'); // BOM per accenti corretti in Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fermate-${nomeTragitto.replace(/[^a-z0-9]+/gi, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notifica('File CSV delle fermate scaricato: lo trovi tra i download.', 'info');
  }

  function apriModificaOperativa(tragitto: CalcoloBusTragitto) {
    const tragittoVero = tragittoVeroDi(tragitto.tragittoId);
    if (!tragittoVero) return;
    const form = {
      prezzoExtra: Number(tragittoVero.prezzoExtra),
      fermate: tragittoVero.fermate.map((f) => ({
        fermataAnagraficaId: f.fermataAnagraficaId,
        citta: f.citta, indirizzo: f.indirizzo,
        orario: f.orario ?? undefined, orarioRitorno: f.orarioRitorno ?? undefined, indirizzoRitorno: f.indirizzoRitorno ?? undefined,
        prezzo: f.prezzo ? Number(f.prezzo) : undefined,
        postiMax: f.postiMax ?? undefined,
        sogliaMinima: f.sogliaMinima, attivo: f.attivo,
      })),
    };
    setFormOperativoMap((prev) => new Map(prev).set(tragitto.tragittoId, form));
    setFormOperativoInizialeMap((prev) => new Map(prev).set(tragitto.tragittoId, JSON.stringify(form)));
    setStatoCalcoloOrariMap((prev) => { const m = new Map(prev); m.delete(tragitto.tragittoId); return m; });
  }
  function chiudiModificaOperativa(tragittoId: string) {
    setFormOperativoMap((prev) => { const m = new Map(prev); m.delete(tragittoId); return m; });
    setFermateIndirizzoEspanso((prev) => new Set([...prev].filter((k) => !k.startsWith(`${tragittoId}::`))));
  }
  async function annullaModificaOperativa(tragittoId: string) {
    const form = formOperativoMap.get(tragittoId);
    if (form && JSON.stringify(form) !== formOperativoInizialeMap.get(tragittoId)) {
      const ok = await conferma({
        titolo: 'Annullare le modifiche?',
        testo: 'Le modifiche a fermate e orari di questo tragitto non ancora salvate andranno perse.',
        conferma: 'Annulla le modifiche',
        annulla: 'Continua a modificare',
        pericolosa: true,
      });
      if (!ok) return;
    }
    chiudiModificaOperativa(tragittoId);
  }

  async function salvaOperativo(tragittoId: string) {
    const form = formOperativoMap.get(tragittoId);
    if (!form) return;
    // Una fermata attiva senza orario non si salva: va completata a mano
    // (succede quando il calcolo automatico non trova un indirizzo).
    const senzaOrario = form.fermate.filter((f) => f.attivo !== false && !f.orario?.trim());
    if (senzaOrario.length > 0) {
      notifica(`${senzaOrario.length === 1 ? 'Una fermata attiva è' : `${senzaOrario.length} fermate attive sono`} ancora senza orario (${senzaOrario.map((f) => f.citta).join(', ')}): completa prima di salvare.`, 'errore');
      return;
    }
    setSalvandoOperativoSet((prev) => new Set(prev).add(tragittoId));
    try {
      // Prima di salvare: se il cambio tocca clienti che hanno già prenotato
      // (orario anticipato o posticipato, indirizzo cambiato, fermata tolta),
      // si vede quanti riceveranno l'email e si decide.
      let anteprima: Awaited<ReturnType<typeof eventiApi.anteprimaTragittoOperativo>>;
      try {
        anteprima = await eventiApi.anteprimaTragittoOperativo(tragittoId, form);
      } catch (e) {
        notifica(`Impossibile controllare quali clienti verrebbero avvisati: ${motivoErrore(e)}`, 'errore');
        return;
      }
      if (!(await confermaAvvisiClienti(anteprima))) return;
      const esito = await eventiApi.aggiornaTragittoOperativo(tragittoId, form);
      chiudiModificaOperativa(tragittoId);
      ricarica();
      onSalvato?.();
      notificaEsitoAvvisi('Orari salvati', esito);
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvandoOperativoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
    }
  }
  function aggiornaFermataOperativa(tragittoId: string, idx: number, campo: keyof FermataInput, valore: string | number | undefined) {
    setFormOperativoMap((prev) => {
      const f = prev.get(tragittoId);
      if (!f) return prev;
      const fermate = [...f.fermate];
      fermate[idx] = { ...fermate[idx], [campo]: valore };
      return new Map(prev).set(tragittoId, { ...f, fermate });
    });
  }

  /** Apre il pannello dei prezzi di vendita, con TUTTE le fermate attive
   *  e i prezzi già salvati (vuoti dove mancano): prima comparivano solo
   *  quelle con un prezzo, e una fermata senza restava in vendita senza
   *  che nessuno se ne accorgesse. */
  function apriPreventivo(tragittoId: string) {
    setAperte((prev) => new Set(prev).add(tragittoId));
    const tragittoVero = tragittoVeroDi(tragittoId);
    setFormPreventivoMap((prev) => new Map(prev).set(tragittoId, {
      costo: tragittoVero?.preventivoCosto ? Number(tragittoVero.preventivoCosto) : undefined,
      postiBus: tragittoVero?.preventivoPostiBus ?? undefined,
      fornitoreId: tragittoVero?.fornitoreId ?? undefined,
    }));
    const prezzi: PrezzoFermata[] = (tragittoVero?.fermate ?? []).filter((f) => f.attivo).map((f) => ({
      fermataId: f.id, citta: f.citta, distanza: null, prezzo: f.prezzo ? Number(f.prezzo) : undefined,
    }));
    setPrezziCalcolatiMap((prev) => new Map(prev).set(tragittoId, prezzi));
    setPrezziInizialiMap((prev) => new Map(prev).set(tragittoId, JSON.stringify(prezzi)));
    const conPrezzi = prezzi.some((p) => p.prezzo);
    setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, conPrezzi
      ? { testo: 'Questi sono i prezzi attuali. Premi "Calcola prezzi per fermata" per ricalcolarli se costo o posti sono cambiati.', tipo: 'info' }
      : { testo: '', tipo: 'info' }));
  }
  function chiudiPreventivo(tragittoId: string) {
    setFormPreventivoMap((prev) => { const m = new Map(prev); m.delete(tragittoId); return m; });
  }
  async function annullaPreventivo(tragittoId: string) {
    if (JSON.stringify(prezziCalcolatiMap.get(tragittoId) ?? []) !== prezziInizialiMap.get(tragittoId)) {
      const ok = await conferma({
        titolo: 'Annullare le modifiche ai prezzi?',
        testo: 'I prezzi calcolati o corretti e non ancora salvati andranno persi.',
        conferma: 'Annulla le modifiche',
        annulla: 'Continua a modificare',
        pericolosa: true,
      });
      if (!ok) return;
    }
    chiudiPreventivo(tragittoId);
  }

  function impostaStatoPrezzi(tragittoId: string, testo: string, tipo: StatoCalcolo['tipo']) {
    setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, { testo, tipo }));
  }
  function fineCalcoloPrezzi(tragittoId: string) {
    setCalcolandoPreventivoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
  }

  /** Calcola il prezzo di ogni fermata dal preventivo, con la formula
   *  confermata insieme:
   *  Posti di pareggio = Posti bus × Soglia di occupazione (%)
   *  Prezzo minimo = Costo bus ÷ Posti di pareggio
   *  Costo al km per persona = (Costo bus ÷ KM totali) ÷ Posti di pareggio
   *  Prezzo fermata = Prezzo minimo + (Costo al km per persona × KM
   *    percorsi da quella fermata fino all'arrivo)
   *  Mai sotto il prezzo minimo (l'arrivo, a 0 km, paga esattamente
   *  quello) — chi sale più lontano paga di più, in proporzione a
   *  quanto usa davvero il bus. */
  async function calcolaPrezziPreventivo(tragittoId: string) {
    const tragittoVero = tragittoVeroDi(tragittoId);
    // Il costo viene da qui — registrato nella sezione Preventivi.
    const costo = tragittoVero?.preventivoCosto ? Number(tragittoVero.preventivoCosto) : undefined;
    const postiBus = tragittoVero?.preventivoPostiBus ?? undefined;
    if (!tragittoVero || !costo || !postiBus) {
      impostaStatoPrezzi(tragittoId, 'Manca ancora un preventivo registrato: registralo prima in Preventivi.', 'errore');
      return;
    }
    const arrivoIndirizzo = tragittoVero.arrivoIndirizzo;
    const fermateAttive = tragittoVero.fermate.filter((f) => f.attivo);
    if (fermateAttive.length === 0) { impostaStatoPrezzi(tragittoId, 'Nessuna fermata attiva su questo tragitto.', 'errore'); return; }
    if (!arrivoIndirizzo?.trim()) { impostaStatoPrezzi(tragittoId, 'Manca l\'indirizzo di arrivo: impostalo in Eventi, nella scheda di questo tragitto.', 'errore'); return; }

    setCalcolandoPreventivoSet((prev) => new Set(prev).add(tragittoId));
    impostaStatoPrezzi(tragittoId, 'Localizzo gli indirizzi…', 'info');

    // L'arrivo non è mai collegato all'anagrafica (l'indirizzo si
    // scrive a mano in Eventi) — va sempre geocodificato per testo,
    // con la città in coda.
    const cittaArrivo = tragittoVero.arrivoCitta?.trim();
    const testoArrivo = cittaArrivo && !arrivoIndirizzo.toLowerCase().includes(cittaArrivo.toLowerCase())
      ? `${arrivoIndirizzo}, ${cittaArrivo}` : arrivoIndirizzo;
    const rArrivo = await geocodifica(testoArrivo);
    if (!rArrivo.coordinate) {
      impostaStatoPrezzi(tragittoId, rArrivo.erroreRete ? ERRORE_MAPPE : `Indirizzo di arrivo "${testoArrivo}" non trovato sulla mappa: correggilo in Eventi, nella scheda di questo tragitto (via, numero civico e città).`, 'errore');
      fineCalcoloPrezzi(tragittoId);
      return;
    }

    const distanze: { fermataId: string; citta: string; distanza: number | null }[] = [];
    for (const f of fermateAttive) {
      // Se la fermata è collegata all'anagrafica e questa ha già lat/lng
      // verificate, le uso direttamente invece di ricercarla per testo.
      const anagrafica = f.fermataAnagraficaId ? fermateAnagrafica.find((fa) => fa.id === f.fermataAnagraficaId) : null;
      let coordinateFermata = anagrafica?.lat != null && anagrafica?.lng != null ? { lat: anagrafica.lat, lng: anagrafica.lng } : null;
      if (!coordinateFermata && f.indirizzo?.trim()) {
        const r = await geocodifica(`${f.indirizzo}, ${f.citta}`);
        coordinateFermata = r.coordinate;
      }
      const km = coordinateFermata ? await distanzaViaggio(coordinateFermata, rArrivo.coordinate) : null;
      distanze.push({ fermataId: f.id, citta: f.citta, distanza: km });
    }

    const valide = distanze.filter((d): d is { fermataId: string; citta: string; distanza: number } => d.distanza !== null);
    // I prezzi scritti a mano per le fermate non trovate restano.
    const precedenti = new Map((prezziCalcolatiMap.get(tragittoId) ?? []).map((p) => [p.fermataId, p.prezzo]));
    const postiDiPareggio = postiBus * (sogliaOccupazionePercento / 100);
    const prezzoMinimo = costo / postiDiPareggio;
    // I km totali = la distanza più lunga tra quelle calcolate (di norma la
    // prima fermata, il punto più lontano dall'arrivo).
    const kmTotali = valide.length ? Math.max(...valide.map((d) => d.distanza)) : 0;
    const costoAlKmPerPersona = kmTotali > 0 ? (costo / kmTotali) / postiDiPareggio : 0;

    setPrezziCalcolatiMap((prev) => new Map(prev).set(tragittoId, distanze.map((d) => d.distanza === null
      ? { fermataId: d.fermataId, citta: d.citta, distanza: null, nonTrovata: true, prezzo: precedenti.get(d.fermataId) }
      : { fermataId: d.fermataId, citta: d.citta, distanza: d.distanza, prezzo: Math.round(prezzoMinimo + costoAlKmPerPersona * d.distanza) })));
    const nonTrovate = distanze.length - valide.length;
    if (valide.length === 0) impostaStatoPrezzi(tragittoId, 'Nessuna fermata trovata sulla mappa: controlla gli indirizzi in Eventi, oppure scrivi i prezzi a mano qui sotto.', 'errore');
    else if (nonTrovate > 0) impostaStatoPrezzi(tragittoId, `${nonTrovate === 1 ? '1 fermata non è stata trovata' : `${nonTrovate} fermate non sono state trovate`} sulla mappa: scrivi a mano il prezzo qui sotto.`, 'errore');
    else impostaStatoPrezzi(tragittoId, '', 'info');
    fineCalcoloPrezzi(tragittoId);
  }

  // Qui si salvano SOLO i prezzi di vendita — il costo/fornitore/file
  // si registrano in Preventivi (uno step prima).
  async function salvaPreventivo(tragitto: CalcoloBusTragitto) {
    const tragittoId = tragitto.tragittoId;
    const prezziCalcolati = prezziCalcolatiMap.get(tragittoId);
    if (!prezziCalcolati || prezziCalcolati.some((p) => !(p.prezzo && p.prezzo > 0))) return;
    // La prima volta il tragitto va in vendita sul sito: si chiede prima.
    const primaVendita = tragitto.stato === 'DA_CONFERMARE';
    if (primaVendita) {
      const ok = await conferma({
        titolo: 'Mettere in vendita il tragitto?',
        testo: <><b>{tragitto.nome}</b>: i prezzi diventano visibili sul sito e i clienti possono prenotare.</>,
        conferma: 'Metti in vendita',
      });
      if (!ok) return;
    }
    setSalvandoPreventivoSet((prev) => new Set(prev).add(tragittoId));
    try {
      await eventiApi.calcolaPrezziVendita(tragittoId, {
        prezziPerFermata: prezziCalcolati.map((p) => ({ fermataId: p.fermataId, prezzo: p.prezzo as number })),
      });
      chiudiPreventivo(tragittoId);
      ricarica();
      onSalvato?.();
      notifica(primaVendita ? 'Prezzi salvati: il tragitto è in vendita.' : 'Prezzi salvati.', 'successo');
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvandoPreventivoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
    }
  }

  function impostaStatoOrari(tragittoId: string, testo: string, tipo: StatoCalcolo['tipo']) {
    setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, { testo, tipo }));
  }
  function fineCalcoloOrari(tragittoId: string) {
    setCalcolandoOrariSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
  }

  /** Ricalcola gli orari di tutte le fermate a ritroso dall'orario di
   *  arrivo, usando le distanze reali tra gli indirizzi via Nominatim +
   *  OSRM (gratuiti). */
  async function calcolaOrariDaArrivo(tragittoId: string) {
    const formOperativo = formOperativoMap.get(tragittoId);
    if (!formOperativo || !eventoCompleto) return;
    const tragittoVero = tragittoVeroDi(tragittoId);
    const arrivoIndirizzoContesto = tragittoVero?.arrivoIndirizzo;
    const arrivoOrarioContesto = tragittoVero?.arrivoOrario;

    const fermateValide = formOperativo.fermate.filter((f) => f.indirizzo?.trim());
    if (fermateValide.length === 0) { impostaStatoOrari(tragittoId, 'Aggiungi almeno una fermata con l\'indirizzo compilato.', 'errore'); return; }
    if (!arrivoIndirizzoContesto?.trim()) { impostaStatoOrari(tragittoId, 'Manca l\'indirizzo di arrivo: impostalo in Eventi, nella scheda di questo tragitto.', 'errore'); return; }
    if (!arrivoOrarioContesto) { impostaStatoOrari(tragittoId, 'Manca l\'orario di arrivo: impostalo in Eventi, nella scheda di questo tragitto.', 'errore'); return; }

    setCalcolandoOrariSet((prev) => new Set(prev).add(tragittoId));
    impostaStatoOrari(tragittoId, 'Localizzo gli indirizzi…', 'info');

    // Se una fermata è collegata all'anagrafica e questa ha già lat/lng
    // verificate, le uso direttamente; geocodifico da capo solo le
    // fermate senza collegamento e l'arrivo.
    const puntiDaLocalizzare = [...fermateValide.map((f) => ({
      indirizzoCompleto: `${f.indirizzo}, ${f.citta}`,
      lat: f.fermataAnagraficaId ? fermateAnagrafica.find((fa) => fa.id === f.fermataAnagraficaId)?.lat : null,
      lng: f.fermataAnagraficaId ? fermateAnagrafica.find((fa) => fa.id === f.fermataAnagraficaId)?.lng : null,
    })), { indirizzoCompleto: arrivoIndirizzoContesto, lat: null, lng: null }];
    const coordinate: (Awaited<ReturnType<typeof geocodifica>>['coordinate'])[] = [];
    let problemaRete = false;
    for (const punto of puntiDaLocalizzare) {
      if (punto.lat != null && punto.lng != null) { coordinate.push({ lat: punto.lat, lng: punto.lng }); continue; }
      const r = await geocodifica(punto.indirizzoCompleto);
      coordinate.push(r.coordinate);
      if (r.erroreRete) problemaRete = true;
    }
    if (problemaRete) {
      impostaStatoOrari(tragittoId, ERRORE_MAPPE, 'errore');
      fineCalcoloOrari(tragittoId);
      return;
    }

    const durate: (number | null)[] = [];
    for (let i = 0; i < coordinate.length - 1; i++) {
      const a = coordinate[i], b = coordinate[i + 1];
      durate.push(a && b ? await durataViaggio(a, b) : null);
      await attesa(300);
    }

    let cursore = Number(arrivoOrarioContesto.split(':')[0]) * 60 + Number(arrivoOrarioContesto.split(':')[1]);
    if (!Number.isFinite(cursore)) {
      impostaStatoOrari(tragittoId, `L'orario di arrivo ("${arrivoOrarioContesto}") non è nel formato HH:MM: correggilo in Eventi, nella scheda di questo tragitto.`, 'errore');
      fineCalcoloOrari(tragittoId);
      return;
    }
    const orariCalcolati = new Array<string>(fermateValide.length);
    let errori = 0;
    for (let i = fermateValide.length - 1; i >= 0; i--) {
      const durata = durate[i];
      if (durata === null) { errori++; orariCalcolati[i] = ''; continue; }
      cursore -= durata + 5;
      const h = Math.floor(((cursore % 1440) + 1440) % 1440 / 60);
      const m = ((cursore % 1440) + 1440) % 1440 % 60;
      orariCalcolati[i] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    let idxValido = 0;
    setFormOperativoMap((prev) => {
      const f = prev.get(tragittoId);
      if (!f) return prev;
      return new Map(prev).set(tragittoId, {
        ...f,
        fermate: f.fermate.map((fer) => {
          if (!fer.indirizzo?.trim()) return fer;
          const orario = orariCalcolati[idxValido]; idxValido++;
          return orario ? { ...fer, orario } : fer;
        }),
      });
    });
    if (errori) impostaStatoOrari(tragittoId, `Orari calcolati, ma ${errori === 1 ? 'per 1 fermata il percorso non è stato trovato' : `per ${errori} fermate il percorso non è stato trovato`}: completa a mano, poi premi Salva.`, 'errore');
    else impostaStatoOrari(tragittoId, 'Orari calcolati: controllali e premi Salva.', 'info');
    fineCalcoloOrari(tragittoId);
  }

  /** Va alla pagina dedicata delle linee di questo tragitto, ricordando da
   *  quale voce di Partenze si arriva (per il "← Torna"). */
  function apriPaginaLinee(tragittoIdContesto: string) {
    navigaSezione('linee', { evento: eventoId, tragitto: tragittoIdContesto, da: contestoPartenze?.tabOrigine ?? null });
  }

  if (caricamento) return <p className="testo-intro">Carico…</p>;
  if (errore) {
    return (
      <div>
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>
        <button type="button" className="btn btn-ghost" onClick={ricarica}>Riprova</button>
      </div>
    );
  }

  // Se ci sono servizi, questa sezione si comporta come se ognuno fosse
  // un evento a parte: filtro i tragitti mostrati secondo la tab scelta.
  const calcoloVisibile = ((servizi && servizi.length > 0)
    ? calcolo.filter((l) => (servizioAttivo === 'liberi' ? !l.servizioId : l.servizioId === servizioAttivo))
    : calcolo
  ).filter((l) => !contestoPartenze || contestoPartenze.tragittiIds.includes(l.tragittoId));

  // Arrivando da una card con più di un tragitto insieme (es.
  // andata+ritorno) — una tab a testa invece di vederli tutti impilati.
  const mostraTabTragitti = !!contestoPartenze && calcoloVisibile.length > 1;
  const tragittoTabSelezionato = mostraTabTragitti
    ? (calcoloVisibile.find((t) => t.tragittoId === tabTragittoAttivo) ?? calcoloVisibile[0])
    : null;
  const calcoloDaRenderizzare = tragittoTabSelezionato ? [tragittoTabSelezionato] : calcoloVisibile;

  const stileEtichettaPiccola = { fontSize: 'var(--testo-xs)', color: 'var(--mist)', textTransform: 'uppercase' as const, letterSpacing: .3 };

  return (
    <div>
      {servizi && servizi.length > 0 && (
        <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {servizi
            // Un servizio con almeno un tragitto configurato ha qualcosa
            // da gestire qui; arrivando da una card di Partenze si vedono
            // SOLO i servizi coinvolti in quello stato.
            .filter((v) => calcolo.some((l) => l.servizioId === v.key))
            .filter((v) => !contestoPartenze || calcolo.some((l) => l.servizioId === v.key && contestoPartenze.tragittiIds.includes(l.tragittoId)))
            .map((v) => {
            const nonCopertiQui = calcolo.filter((l) => l.servizioId === v.key && l.totalePasseggeri > 0 && !l.coperta).length;
            return (
              <button key={v.key} type="button" className={`mini-tab${servizioAttivo === v.key ? ' active' : ''}`} onClick={() => setServizioAttivo(v.key)}>
                {v.nome}
                {nonCopertiQui > 0 && (
                  <span title={`${plurale(nonCopertiQui, 'tragitto', 'tragitti')} con prenotazioni ma senza bus sufficienti`} style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 'var(--testo-xs)', padding: '1px 6px', fontWeight: 700 }}>
                    {nonCopertiQui}
                  </span>
                )}
              </button>
            );
          })}
          {calcolo.some((l) => !l.servizioId) && (!contestoPartenze || calcolo.some((l) => !l.servizioId && contestoPartenze.tragittiIds.includes(l.tragittoId))) && (() => {
            const nonCopertiLiberi = calcolo.filter((l) => !l.servizioId && l.totalePasseggeri > 0 && !l.coperta).length;
            return (
              <button type="button" className={`mini-tab${servizioAttivo === 'liberi' ? ' active' : ''}`} onClick={() => setServizioAttivo('liberi')}>
                Tragitti liberi
                {nonCopertiLiberi > 0 && (
                  <span title={`${plurale(nonCopertiLiberi, 'tragitto', 'tragitti')} con prenotazioni ma senza bus sufficienti`} style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 'var(--testo-xs)', padding: '1px 6px', fontWeight: 700 }}>
                    {nonCopertiLiberi}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {calcoloVisibile.length === 0 && (
        <p className="testo-intro">Questo evento non ha ancora tragitti: aggiungili da Eventi, nella scheda dell'evento.</p>
      )}

      <div className="partenze-layout">
      {mostraTabTragitti && (
        <div className="mini-tabs partenze-tabs-colonna" style={{ marginBottom: 16 }}>
          {calcoloVisibile.map((t) => {
            // La tab stessa diventa verde una volta fatta, non solo il
            // contenuto dentro, visibile anche senza doverci cliccare.
            const tv = tragittoVeroDi(t.tragittoId);
            const fattoQui = contestoPartenze?.tabOrigine === 'fermate' ? tv?.fermate.some((f) => f.orario)
              : contestoPartenze?.tabOrigine === 'da-prezzare' ? t.stato !== 'DA_CONFERMARE' // prezzi di vendita salvati, non solo un preventivo
              : null; // "fatto/da fare" non si applica alle altre tappe allo stesso modo — resta neutra
            return (
              <button
                key={t.tragittoId} type="button"
                className={`mini-tab${tragittoTabSelezionato?.tragittoId === t.tragittoId ? ' active' : ''}${fattoQui === null ? '' : fattoQui ? ' completato' : ' attenzione'}`}
                onClick={() => setTabTragittoAttivo(t.tragittoId)}
              >
                {t.nome} · {plurale(tv?.fermate.filter((f) => f.attivo !== false).length ?? 0, 'fermata', 'fermate')}
              </button>
            );
          })}
        </div>
      )}

      <div className="partenze-contenuto">
      {calcoloDaRenderizzare.map((tragitto) => {
        const stato = statoTragitto(tragitto);
        const busTragitto = busLista.filter((b) => b.tragittiIds.includes(tragitto.tragittoId));
        const espansa = aperte.has(tragitto.tragittoId);
        const tragittoVeroPerOrari = tragittoVeroDi(tragitto.tragittoId);
        const orariImpostati = tragittoVeroPerOrari?.fermate.some((f) => f.orario) ?? false;
        // "In vendita" nella tab Prezzi: vero solo quando i prezzi di
        // vendita sono salvati (lo stato lascia DA_CONFERMARE).
        const prezzato = tragitto.stato !== 'DA_CONFERMARE';
        const datiEconomia = economia.find((e) => e.tragittoId === tragitto.tragittoId);
        return (
        <div
          key={tragitto.tragittoId} className="section-card"
          style={stato.classe === 'non-coperta' ? { borderColor: 'var(--pink)' } : undefined}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: contestoPartenze ? 'default' : 'pointer' }}
            // Comprimere/espandere ha senso solo nell'elenco generale;
            // arrivando da una card/tappa specifica il contenuto sotto è
            // sempre mostrato per intero.
            onClick={contestoPartenze ? undefined : () => toggleApertura(tragitto.tragittoId)}
          >
            <div>
              <h3>{!contestoPartenze && (espansa ? '▾ ' : '▸ ')}{tragitto.nome}</h3>
              {contestoPartenze?.tabOrigine !== 'fermate' && contestoPartenze?.tabOrigine !== 'da-prezzare' && contestoPartenze?.tabOrigine !== 'da-confermare' && (() => {
                // I passeggeri confermati di ogni fermata attiva, anche a
                // zero, dal calcolo bus (lo stesso dato della pagina Linee):
                // prima arrivavano da un elenco riservato a chi vede gli
                // incassi, e per gli altri restava "Carico…" per sempre.
                const fermateAttive = tragittoVeroPerOrari?.fermate.filter((f) => f.attivo !== false) ?? [];
                const passeggeriPerFermata = new Map(tragitto.fermate.map((f) => [f.fermataId, f.passeggeri]));
                return (
                <p className="section-sub">
                  {fermateAttive.length === 0 ? 'Nessuna fermata attiva' : (
                    <>Passeggeri: {fermateAttive.map((f, i) => (
                      <span key={f.id}>{i > 0 && ' · '}{f.citta} <strong>{passeggeriPerFermata.get(f.id) ?? 0}</strong></span>
                    ))}</>
                  )}
                  {' · '}{plurale(busTragitto.length, 'bus assegnato', 'bus assegnati')}
                  {vedeEconomia && datiEconomia && (
                    <>
                      {' · '}<span style={{ color: 'var(--green)' }}>Incassati {formattaEuro(datiEconomia.incassato)}</span>
                      {datiEconomia.costoCensito && <>{' · '}<span style={{ color: datiEconomia.guadagno >= 0 ? 'var(--green)' : 'var(--pink)' }}>Guadagno {formattaEuro(datiEconomia.guadagno)}</span></>}
                    </>
                  )}
                </p>
                );
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {contestoPartenze?.tabOrigine === 'fermate' ? (
                <span className={`badge ${orariImpostati ? 'badge-stato-verde' : 'badge-stato-arancio'}`}>
                  {orariImpostati ? 'Orari impostati' : 'Orari da impostare'}
                </span>
              ) : contestoPartenze?.tabOrigine === 'da-prezzare' ? (
                <span className={`badge ${prezzato ? 'badge-stato-verde' : 'badge-stato-arancio'}`}>
                  {prezzato ? 'In vendita' : 'Da prezzare'}
                </span>
              ) : contestoPartenze?.tabOrigine === 'preventivi' ? (
                // Qui conta solo se un preventivo c'è già: accettato da un
                // fornitore, o registrato a mano.
                <span className={`badge ${tragittoVeroPerOrari?.fornitoreId || tragittoVeroPerOrari?.preventivoCosto ? 'badge-stato-verde' : 'badge-stato-arancio'}`}>
                  {tragittoVeroPerOrari?.fornitoreId ? 'Accettato' : tragittoVeroPerOrari?.preventivoCosto ? 'Registrato' : 'Da richiedere'}
                </span>
              ) : (
                <span className={`badge ${classeBadge(stato.classe)}`}>{stato.etichetta}</span>
              )}
              {tragitto.stato === 'PREZZATO' && (
                <span style={{ fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>In vendita, nessun bus assegnato</span>
              )}
              {!contestoPartenze && (
                <>
                  <button
                    type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '3px 10px' }}
                    onClick={(e) => { e.stopPropagation(); apriModificaOperativa(tragitto); }}
                  >
                    Modifica orari
                  </button>
                  <button
                    type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '3px 10px' }}
                    onClick={(e) => { e.stopPropagation(); apriPaginaLinee(tragitto.tragittoId); }}
                  >
                    Gestisci linee{busTragitto.length > 0 ? ` (${plurale(busTragitto.length, 'bus', 'bus')})` : ''}
                  </button>
                  <button
                    type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '3px 10px', borderColor: 'var(--pink-dim)', color: 'var(--pink)' }}
                    onClick={(e) => { e.stopPropagation(); apriPreventivo(tragitto.tragittoId); }}
                  >
                    {tragitto.stato === 'DA_CONFERMARE' ? 'Calcola prezzi' : 'Vedi prezzi'}
                  </button>
                </>
              )}
            </div>
          </div>

          {(() => {
            const formOperativo = formOperativoMap.get(tragitto.tragittoId);
            const formPreventivo = formPreventivoMap.get(tragitto.tragittoId);
            const prezziCalcolati = prezziCalcolatiMap.get(tragitto.tragittoId);
            const statoCalcoloOrari = statoCalcoloOrariMap.get(tragitto.tragittoId);
            const statoCalcoloPreventivo = statoCalcoloPreventivoMap.get(tragitto.tragittoId);
            const calcolandoOrari = calcolandoOrariSet.has(tragitto.tragittoId);
            const calcolandoPreventivo = calcolandoPreventivoSet.has(tragitto.tragittoId);
            const salvandoOperativo = salvandoOperativoSet.has(tragitto.tragittoId);
            const salvandoPreventivo = salvandoPreventivoSet.has(tragitto.tragittoId);

            if (formOperativo) return (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <p className="section-label" style={{ marginBottom: 0 }}>Fermate</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-md)' }} onClick={() => calcolaOrariDaArrivo(tragitto.tragittoId)} disabled={calcolandoOrari}>
                      {calcolandoOrari ? 'Calcolo gli orari…' : 'Calcola orari dall\'arrivo'}
                    </button>
                    <button
                      type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-md)' }}
                      onClick={() => esportaFermateCsv(tragitto.nome, formOperativo.fermate)}
                    >
                      Esporta CSV per il fornitore
                    </button>
                  </div>
                </div>
                {statoCalcoloOrari?.testo && (
                  <p className="testo-intro" role={statoCalcoloOrari.tipo === 'errore' ? 'alert' : undefined} style={{ fontSize: 'var(--testo-md)', marginTop: -4, marginBottom: 10, ...(statoCalcoloOrari.tipo === 'errore' ? { color: 'var(--pink)', fontWeight: 600 } : {}) }}>
                    {statoCalcoloOrari.testo}
                  </p>
                )}
                {formOperativo.fermate.map((f, idx) => {
                  const chiaveEspanso = `${tragitto.tragittoId}::${idx}`;
                  const indirizzoAperto = fermateIndirizzoEspanso.has(chiaveEspanso);
                  return (
                  <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Doppio tap (mobile) o doppio clic (desktop) —
                          un tap solo è troppo facile da toccare per
                          sbaglio scorrendo la lista. */}
                      <div
                        onDoubleClick={() => setFermateIndirizzoEspanso((prev) => {
                          const nuovo = new Set(prev);
                          if (nuovo.has(chiaveEspanso)) nuovo.delete(chiaveEspanso); else nuovo.add(chiaveEspanso);
                          return nuovo;
                        })}
                        title="Doppio clic per modificare l'indirizzo"
                        style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 'var(--testo-base)', flexShrink: 0 }}>{f.citta}</span>
                        {!indirizzoAperto && (
                          <span style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            — {f.indirizzo || 'nessun indirizzo'}
                          </span>
                        )}
                      </div>
                      <div style={{ width: 110, flexShrink: 0 }}>
                        <OrarioInput value={f.orario ?? ''} onChange={(v) => aggiornaFermataOperativa(tragitto.tragittoId, idx, 'orario', v)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'right' }} />
                      </div>
                      <button
                        type="button" className="btn btn-ghost btn-piccolissimo" style={{ color: 'var(--pink)', flexShrink: 0 }}
                        onClick={() => {
                          setFormOperativoMap((prev) => {
                            const f2 = prev.get(tragitto.tragittoId);
                            if (!f2) return prev;
                            return new Map(prev).set(tragitto.tragittoId, { ...f2, fermate: f2.fermate.filter((_, i) => i !== idx) });
                          });
                          // Le righe si spostano di posto: l'indirizzo aperto
                          // non deve finire sulla fermata successiva.
                          setFermateIndirizzoEspanso((prev) => new Set([...prev].filter((k) => !k.startsWith(`${tragitto.tragittoId}::`))));
                        }}
                      >
                        Rimuovi
                      </button>
                    </div>
                    {indirizzoAperto && (
                      <input
                        value={f.indirizzo ?? ''}
                        onChange={(e) => aggiornaFermataOperativa(tragitto.tragittoId, idx, 'indirizzo', e.target.value)}
                        placeholder="Indirizzo"
                        aria-label={`Indirizzo della fermata di ${f.citta}`}
                        autoFocus
                        style={{ width: '100%', marginTop: 6, fontSize: 'var(--testo-md)', padding: '4px 8px' }}
                      />
                    )}
                  </div>
                  );
                })}
                {fermateAnagrafica.length > 0 && (
                  <select
                    style={{ marginTop: 10 }}
                    value=""
                    aria-label="Aggiungi una fermata a questo tragitto"
                    onChange={(e) => {
                      const scelta = fermateAnagrafica.find((fa) => fa.id === e.target.value);
                      if (!scelta) return;
                      setFormOperativoMap((prev) => {
                        const f2 = prev.get(tragitto.tragittoId);
                        if (!f2) return prev;
                        return new Map(prev).set(tragitto.tragittoId, { ...f2, fermate: [...f2.fermate, { fermataAnagraficaId: scelta.id, citta: scelta.citta, indirizzo: scelta.indirizzo }] });
                      });
                    }}
                  >
                    <option value="" disabled>+ Aggiungi una fermata a questo tragitto…</option>
                    {fermateAnagrafica.map((fa) => (
                      <option key={fa.id} value={fa.id}>{fa.nome === fa.citta ? fa.nome : `${fa.nome} — ${fa.citta}`}</option>
                    ))}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={salvandoOperativo} onClick={() => salvaOperativo(tragitto.tragittoId)}>
                    {salvandoOperativo ? 'Salvo…' : 'Salva orari'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => annullaModificaOperativa(tragitto.tragittoId)}>Annulla</button>
                </div>
              </div>
            );

            if (formPreventivo) return (
              <div style={{ marginTop: 14 }}>
                {/* Stessa posizione del pulsante "Calcola orari": titolo a
                    sinistra, azione a destra. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <p className="section-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center' }}>
                    Prezzi di vendita
                    <InfoTooltip>{mappaTooltip.preventivo_form_intro ?? TOOLTIP_DEFAULT.preventivo_form_intro}</InfoTooltip>
                  </p>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-md)' }} onClick={() => calcolaPrezziPreventivo(tragitto.tragittoId)} disabled={calcolandoPreventivo}>
                    {calcolandoPreventivo ? 'Calcolo i prezzi…' : 'Calcola prezzi per fermata'}
                  </button>
                </div>
                {/* Costo, posti presunti e fornitore si registrano in
                    Preventivi: qui sono di sola lettura. */}
                <div className="section-card" style={{ marginBottom: 16, background: 'var(--dusk-2)' }}>
                  <div className="form-grid">
                    <div><span style={stileEtichettaPiccola}>Costo del preventivo</span><p style={{ margin: '2px 0 0', fontWeight: 600 }}>{formPreventivo.costo != null ? formattaEuro(formPreventivo.costo) : 'Non registrato'}</p></div>
                    <div><span style={stileEtichettaPiccola}>Posti presunti del bus</span><p style={{ margin: '2px 0 0', fontWeight: 600 }}>{formPreventivo.postiBus ?? 'Non indicati'}</p></div>
                    <div><span style={stileEtichettaPiccola}>Fornitore</span><p style={{ margin: '2px 0 0', fontWeight: 600 }}>{nomeFornitore(formPreventivo.fornitoreId)}</p></div>
                  </div>
                  <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', marginTop: 8, marginBottom: 0 }}>Per cambiare costo o fornitore, vai in Preventivi.</p>
                </div>
                {sogliaNonLetta && (
                  <p className="testo-intro" style={{ fontSize: 'var(--testo-md)', marginTop: -4, marginBottom: 12 }}>
                    Non riesco a leggere la soglia di pareggio dalle Impostazioni: il calcolo usa il {sogliaOccupazionePercento}%.
                  </p>
                )}
                {statoCalcoloPreventivo?.testo && (
                  <p className="testo-intro" role={statoCalcoloPreventivo.tipo === 'errore' ? 'alert' : undefined} style={{ fontSize: 'var(--testo-md)', marginTop: -4, marginBottom: 12, ...(statoCalcoloPreventivo.tipo === 'errore' ? { color: 'var(--pink)', fontWeight: 600 } : {}) }}>
                    {statoCalcoloPreventivo.testo}
                  </p>
                )}
                {prezziCalcolati && prezziCalcolati.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p className="section-label" style={{ marginBottom: 8 }}>Prezzo per fermata: controllalo prima di salvare</p>
                    {prezziCalcolati.map((p) => (
                      <div key={p.fermataId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 'var(--testo-base)' }}>
                        <span>
                          {p.citta}{' '}
                          {p.distanza != null && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({p.distanza} km dall'arrivo)</span>}
                          {p.nonTrovata && <span style={{ color: 'var(--pink)', fontSize: 'var(--testo-sm)' }}>(non trovata sulla mappa: scrivi il prezzo)</span>}
                        </span>
                        {/* Modificabile a mano: il prezzo calcolato è un punto di partenza. */}
                        <CampoNumero
                          valuta
                          aria-label={`Prezzo di vendita da ${p.citta}`}
                          value={p.prezzo}
                          onChange={(v) => setPrezziCalcolatiMap((prev) => new Map(prev).set(tragitto.tragittoId, (prev.get(tragitto.tragittoId) ?? []).map((x) => x.fermataId === p.fermataId ? { ...x, prezzo: v } : x)))}
                          style={{ width: 110, flexShrink: 0, textAlign: 'right' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {prezziCalcolati?.some((p) => !(p.prezzo && p.prezzo > 0)) && (
                  <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', marginBottom: 10 }}>Per salvare serve un prezzo per ogni fermata.</p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button" className="btn btn-primary" style={{ flex: 1 }}
                    disabled={!prezziCalcolati || prezziCalcolati.length === 0 || prezziCalcolati.some((p) => !(p.prezzo && p.prezzo > 0)) || salvandoPreventivo}
                    onClick={() => salvaPreventivo(tragitto)}
                  >
                    {salvandoPreventivo ? 'Salvo…' : tragitto.stato === 'DA_CONFERMARE' ? 'Metti in vendita' : 'Salva prezzi'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => annullaPreventivo(tragitto.tragittoId)}>Annulla</button>
                </div>
              </div>
            );

            if (!espansa) return null;

            const tragittoVero = tragittoVeroPerOrari;

            // In "Orari" e "Prezzi", una volta chiuso l'editor deve restare
            // possibile RIVEDERE quello che c'è già: vista di sola lettura.
            if (contestoPartenze?.tabOrigine === 'fermate') {
              const partenzaVero = tragittoVero?.fermate[0];
              const fermateIntermedie = tragittoVero?.fermate.slice(1) ?? [];
              const rigaOrario = { display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 'var(--testo-base)' } as const;
              return (
              <div style={{ marginTop: 14 }}>
                <p className="section-label" style={{ marginBottom: 8 }}>Partenza</p>
                {partenzaVero ? (
                  <div style={{ ...rigaOrario, marginBottom: 14 }}>
                    <span>{partenzaVero.citta}</span>
                    <span style={{ textAlign: 'right', color: partenzaVero.orario ? 'var(--mist)' : 'var(--pink)' }}>{partenzaVero.orario ?? 'orario da impostare'}</span>
                  </div>
                ) : <p className="testo-intro" style={{ marginBottom: 14 }}>Nessuna fermata su questo tragitto.</p>}

                <p className="section-label" style={{ marginBottom: 8 }}>Fermate intermedie ({fermateIntermedie.filter((f) => f.attivo !== false).length})</p>
                {fermateIntermedie.length === 0
                  ? <p className="testo-intro">Nessuna fermata intermedia: si va dritti dalla partenza all'arrivo.</p>
                  : fermateIntermedie.map((f) => (
                    <div key={f.id} style={rigaOrario}>
                      <span>{f.citta}</span>
                      <span style={{ textAlign: 'right', color: f.orario ? 'var(--mist)' : 'var(--pink)' }}>{f.orario ?? 'orario da impostare'}</span>
                    </div>
                  ))}
                {/* L'arrivo è necessario per calcolare gli orari: sempre in
                    vista, così si controlla a colpo d'occhio. */}
                <p className="section-label" style={{ marginTop: 14, marginBottom: 8 }}>Arrivo</p>
                {tragittoVero?.arrivoCitta || tragittoVero?.arrivoIndirizzo || tragittoVero?.arrivoOrario ? (
                  <div style={rigaOrario}>
                    <span>
                      {tragittoVero.arrivoCitta || 'Città da impostare'}
                      {tragittoVero.arrivoIndirizzo && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}> — {tragittoVero.arrivoIndirizzo}</span>}
                    </span>
                    <span style={{ textAlign: 'right', color: tragittoVero.arrivoOrario ? 'var(--mist)' : 'var(--pink)' }}>{tragittoVero.arrivoOrario ?? 'orario da impostare'}</span>
                  </div>
                ) : (
                  <p style={{ color: 'var(--pink)', fontSize: 'var(--testo-base)' }}>Arrivo non impostato: scrivilo in Eventi, nella scheda di questo tragitto.</p>
                )}
                <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => apriModificaOperativa(tragitto)}>Modifica orari</button>
              </div>
              );
            }
            if (contestoPartenze?.tabOrigine === 'da-prezzare') {
              const tv = tragittoVero;
              const rigaPrezzo = { display: 'grid', gridTemplateColumns: '1fr 110px 130px', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 'var(--testo-base)' } as const;
              return (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <p className="section-label" style={{ margin: 0 }}>Preventivo</p>
                  {prezzato && <span className="badge badge-stato-verde">In vendita</span>}
                </div>
                {tv?.preventivoCosto
                  ? <p style={{ fontSize: 'var(--testo-base)', marginBottom: 12 }}>{formattaEuro(tv.preventivoCosto)} · {tv.preventivoPostiBus != null ? plurale(tv.preventivoPostiBus, 'posto presunto', 'posti presunti') : 'posti non indicati'}</p>
                  : <p className="testo-intro" style={{ marginBottom: 12 }}>Nessun preventivo ancora registrato.</p>}
                <p className="section-label" style={{ marginBottom: 8 }}>Fermate — orario e prezzo ({tv ? tv.fermate.filter((f) => f.attivo !== false).length : 0})</p>
                {/* Colonne vere (grid) con numeri allineati a destra, come
                    nell'editor: la colonna non salta passando dall'una all'altra. */}
                {!tv || tv.fermate.length === 0
                  ? <p className="testo-intro">Nessuna fermata su questo tragitto.</p>
                  : <>
                    <div style={{ ...rigaPrezzo, borderBottom: 'none', padding: '4px 0', ...stileEtichettaPiccola }}>
                      <span>Città</span><span style={{ textAlign: 'right' }}>Orario</span><span style={{ textAlign: 'right' }}>Prezzo</span>
                    </div>
                    {tv.fermate.filter((f) => f.attivo !== false).map((f) => (
                      <div key={f.id} style={rigaPrezzo}>
                        <span>{f.citta}</span>
                        <span style={{ textAlign: 'right', color: f.orario ? 'var(--mist)' : 'var(--pink)' }}>{f.orario ?? 'da impostare'}</span>
                        <span style={{ textAlign: 'right', fontWeight: 600, color: f.prezzo ? undefined : 'var(--pink)' }}>{f.prezzo ? formattaEuro(f.prezzo) : 'da impostare'}</span>
                      </div>
                    ))}
                  </>}
                <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => apriPreventivo(tragitto.tragittoId)}>Modifica prezzi</button>
              </div>
              );
            }
            if (contestoPartenze?.tabOrigine === 'preventivi') {
              return (
                <PreventiviTragitto
                  tragittoId={tragitto.tragittoId}
                  tragittoVero={tragittoVero}
                  puoAccettare={puoAccettarePreventivi}
                  onCambiato={() => { ricarica(); onSalvato?.(); }}
                />
              );
            }
            if (contestoPartenze?.tabOrigine === 'da-confermare') {
              // La pagina delle linee del tragitto compare DIRETTAMENTE qui,
              // incorporata: ogni modifica fatta lì aggiorna anche questa
              // intestazione e le card in elenco.
              return <LineeTragittoScreen eventoIdProp={eventoId} tragittoIdProp={tragitto.tragittoId} incorporata onModificato={() => { ricarica(); onSalvato?.(); }} />;
            }

            // Riepilogo a righe (Confermate/Passate, o senza contesto) —
            // ogni riga porta alla modifica di quel dato specifico.
            caricaLineeSeServe(tragitto.tragittoId);
            const lineeCaricate = lineePerTragitto.get(tragitto.tragittoId);
            const linee = Array.isArray(lineeCaricate) ? lineeCaricate : [];
            const busNelleLinee = linee.flatMap((l) => l.bus);
            const postiNelleLinee = busNelleLinee.reduce((tot, b) => tot + (b.postiBus ?? 0), 0);
            const rigaStile: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' };
            return (
              <div style={{ marginTop: 14 }}>
                <div style={rigaStile}>
                  <div><strong style={{ fontSize: 'var(--testo-base)' }}>Fermate</strong> <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)' }}>· {plurale(tragitto.fermate.length, 'fermata', 'fermate')}</span></div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '3px 10px' }} onClick={() => apriModificaOperativa(tragitto)}>Modifica</button>
                </div>
                <div style={rigaStile}>
                  <div>
                    <strong style={{ fontSize: 'var(--testo-base)' }}>Preventivo</strong>{' '}
                    <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)' }}>
                      · {tragittoVero?.preventivoCosto ? `${formattaEuro(tragittoVero.preventivoCosto)} · ${tragittoVero.preventivoPostiBus != null ? plurale(tragittoVero.preventivoPostiBus, 'posto presunto', 'posti presunti') : 'posti non indicati'}` : 'non registrato'}
                    </span>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '3px 10px' }} onClick={() => apriPreventivo(tragitto.tragittoId)}>Modifica</button>
                </div>
                <div style={rigaStile}>
                  <div>
                    <strong style={{ fontSize: 'var(--testo-base)' }}>Linee</strong>{' '}
                    <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)' }}>
                      · {lineeCaricate === undefined ? 'Carico…'
                        : lineeCaricate === 'errore' ? 'non disponibili'
                        : `${plurale(linee.length, 'linea', 'linee')} · ${plurale(busNelleLinee.length, 'bus', 'bus')} · ${plurale(postiNelleLinee, 'posto', 'posti')}`}
                    </span>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '3px 10px' }} onClick={() => apriPaginaLinee(tragitto.tragittoId)}>Modifica</button>
                </div>
                {vedeEconomia && datiEconomia && (
                  <div style={{ ...rigaStile, borderBottom: datiEconomia.perLinea.length > 1 ? '1px solid var(--line)' : 'none' }}>
                    <div>
                      <strong style={{ fontSize: 'var(--testo-base)' }}>Incassi</strong>{' '}
                      <span style={{ color: 'var(--green)', fontSize: 'var(--testo-md)' }}>· Incassati {formattaEuro(datiEconomia.incassato)}</span>
                      {datiEconomia.costoCensito && <span style={{ color: datiEconomia.guadagno >= 0 ? 'var(--green)' : 'var(--pink)', fontSize: 'var(--testo-md)' }}> · Guadagno {formattaEuro(datiEconomia.guadagno)}</span>}
                    </div>
                  </div>
                )}
                {/* Dettaglio per singola linea — solo con più di una, per
                    capire QUALE linea guadagna di più quando i costi sono
                    diversi. */}
                {vedeEconomia && datiEconomia && datiEconomia.perLinea.length > 1 && datiEconomia.perLinea.map((pl, idx) => (
                  <div key={pl.lineaId} style={{ ...rigaStile, paddingLeft: 14, borderBottom: idx === datiEconomia.perLinea.length - 1 ? 'none' : '1px solid var(--line)' }}>
                    <div>
                      <span style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)' }}>{pl.lineaNome}</span>{' '}
                      <span style={{ color: 'var(--green)', fontSize: 'var(--testo-md)' }}>· Incassati {formattaEuro(pl.incassato)}</span>
                      {pl.costoCensito && <span style={{ color: pl.guadagno >= 0 ? 'var(--green)' : 'var(--pink)', fontSize: 'var(--testo-md)' }}> · Guadagno {formattaEuro(pl.guadagno)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        );
      })}
      </div>
      </div>

    </div>
  );
}
