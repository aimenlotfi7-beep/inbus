import { api } from './client';

/** Statistiche del gestionale (sezione Statistiche). Tutti gli importi sono
 *  in euro, già numeri. Le date "dal"/"al" sono giorni di Roma (YYYY-MM-DD),
 *  entrambi compresi. Contano solo le prenotazioni CONFERMATE di eventi non
 *  in bozza e non nel cestino. Due voci separate (proprietario, settembre
 *  2026): `incasso` è il previsto, il valore delle prenotazioni (un acconto non
 *  ancora saldato conta già per il prezzo intero); `incassato` è quanto è stato
 *  pagato davvero. Allo stesso modo `margine` è previsto e `margineAOggi` usa
 *  l'incassato. */

export type Confronto = 'anno' | 'precedente' | 'nessuno';
export type Granularita = 'giorno' | 'settimana' | 'mese';

export interface FiltroPeriodo {
  dal: string;
  al: string;
  confronto: Confronto;
}

export interface PeriodoRisposta {
  dal: string;
  al: string;
  confrontoDal: string | null;
  confrontoAl: string | null;
  granularita: Granularita;
  /** Un intervallo per punto dei grafici nel tempo ("15 giu", "giu 2026"). */
  intervalli: { etichetta: string; dal: string }[];
}

/** precedente = stesso numero nel periodo di confronto; null se il confronto è spento. */
export interface Valore {
  attuale: number;
  precedente: number | null;
}

/** Fonte di una prenotazione, in quest'ordine: promoter (codice), White
 *  Label (widget), campagna registrata (UTM), UTM non registrati, sito. */
export type TipoFonte = 'promoter' | 'white_label' | 'campagna' | 'utm_non_registrata' | 'sito';

export interface RigaFonteSintesi {
  tipo: TipoFonte;
  nome: string;
  prenotazioni: number;
  passeggeri: number;
  incasso: number;
  incassato: number;
}

export interface RigaFonte extends RigaFonteSintesi {
  /** Commissione del promoter o quota dell'organizzatore White Label. */
  commissione: number;
  margineNetto: number;
}

// ---------------------------------------------------------------- Panoramica

export interface StatistichePanoramica {
  periodo: PeriodoRisposta;
  /** Per data d'acquisto: quello che si è venduto nel periodo. */
  vendite: {
    passeggeri: Valore;
    prenotazioni: Valore;
    incasso: Valore;
    incassato: Valore;
    /** incasso ÷ passeggeri; 0 se nessun passeggero. */
    ricavoPerPasseggero: Valore;
    /** Passeggeri per intervallo; precedente allineato per posizione. */
    andamento: { attuale: number; precedente: number | null }[];
  };
  /** Per data dell'evento: gli eventi che si sono svolti (o si svolgono) nel periodo. */
  eventiDelPeriodo: {
    eventi: Valore;
    passeggeri: Valore;
    incasso: Valore;
    incassato: Valore;
    costoBus: Valore;
    /** Commissioni promoter + quote White Label. */
    commissioni: Valore;
    /** Compensi dei responsabili degli eventi (collaboratori). */
    compensi: Valore;
    margine: Valore;
    margineAOggi: Valore;
    /** Passeggeri ÷ posti dei bus confermati, in %, solo sui tragitti con bus. null = nessun bus. */
    riempimentoBus: { attuale: number | null; precedente: number | null };
    /** Eventi del periodo con passeggeri e costi dei bus incompleti (un bus
     *  senza costo, o un tragitto con passeggeri e nessun bus): il loro
     *  margine è più alto del vero. */
    eventiConCostiMancanti: number;
  };
  /** Per data d'acquisto, una riga per tipo di fonte, dalla più alta. */
  perFonte: RigaFonteSintesi[];
}

export type TipoAvviso =
  | 'percorso_cambiato'
  | 'linea_sotto_pareggio'
  | 'posti_mancanti'
  | 'linea_da_confermare'
  | 'saldo_scaduto'
  | 'rimborso_in_attesa'
  | 'preventivo_da_valutare';

/** urgente = viola (solo percorso cambiato), critico = rosso, attenzione = ambra. */
export type GravitaAvviso = 'urgente' | 'critico' | 'attenzione';

/** Voci del menu a cui porta un avviso (sono tutte id di SezioneGestionale). */
export type SezioneAvviso = 'partenze-preventivi' | 'partenze-confermato' | 'partenze-da-confermare' | 'pagamenti' | 'rimborsi';

export interface AvvisoStatistiche {
  tipo: TipoAvviso;
  gravita: GravitaAvviso;
  titolo: string;
  dettaglio: string;
  /** Voce del menu da aprire. */
  sezione: SezioneAvviso;
  eventoId: string | null;
  /** Data dell'evento, se c'è: serve a ordinare. */
  data: string | null;
}

// ---------------------------------------------------------------- Eventi e linee

export interface RigaEventoStatistiche {
  id: string;
  artista: string;
  citta: string;
  luogo: string;
  data: string;
  /** Giorni di calendario (Roma) da oggi alla data dell'evento; negativo se passato. */
  giorniAllaPartenza: number;
  passeggeri: number;
  incasso: number;
  incassato: number;
  /** Posti dei bus confermati (linee con bus). */
  postiSuiBus: number;
  /** passeggeri ÷ postiSuiBus in %; null senza bus. */
  riempimento: number | null;
  lineeSottoPareggio: number;
  lineeDaConfermare: number;
  percorsiCambiati: number;
  listaAttesa: number;
  /** null = nessun bus confermato. */
  costoBus: number | null;
  costoCompleto: boolean;
  commissioni: number;
  /** Compenso del responsabile dell'evento; 0 se non c'è. */
  compenso: number;
  /** incasso − costo bus − commissioni − compenso; null se l'evento non ha
   *  nessun bus (con costoCompleto false il costo dei bus è parziale). */
  margine: number | null;
  margineAOggi: number | null;
  venditeFermate: boolean;
}

export interface StatisticheEventi {
  periodo: PeriodoRisposta;
  /** Eventi da oggi in poi, dal più vicino. */
  inVendita: RigaEventoStatistiche[];
  /** Eventi già passati con la data nel periodo, dal più recente. */
  passati: RigaEventoStatistiche[];
}

export interface RigaLineaStatistiche {
  id: string;
  nome: string;
  tragittoNome: string;
  daConfermare: boolean;
  fermate: string[];
  /** Posti dei bus della linea; senza bus (come una linea da confermare), i posti del preventivo. */
  posti: number;
  /** Linea con bus: passeggeri delle fermate che copre. Linea da confermare:
   *  i passeggeri che non stanno nei posti delle linee con bus. */
  passeggeri: number;
  /** null per le linee senza bus: non c'è un costo da coprire. */
  postiPareggio: number | null;
  /** Passeggeri già assegnati ai bus della linea e quanti di loro sono saliti. */
  assegnati: number;
  saliti: number;
  incasso: number;
  incassato: number;
  /** null per le linee senza bus. */
  costo: number | null;
  costoCompleto: boolean;
  margine: number | null;
  margineAOggi: number | null;
}

export interface RigaFermataStatistiche {
  tragittoNome: string;
  citta: string;
  attiva: boolean;
  passeggeri: number;
  incasso: number;
  incassato: number;
  /** Prezzo attuale della fermata, se impostato. */
  prezzo: number | null;
  /** Giorni medi tra prenotazione ed evento, pesati sui passeggeri. */
  anticipoMedioGiorni: number | null;
  listaAttesa: number;
}

export interface StatisticheEvento {
  evento: {
    id: string;
    artista: string;
    genere: string;
    citta: string;
    luogo: string;
    data: string;
    giorniAllaPartenza: number;
    venditeFermate: boolean;
  };
  sintesi: {
    passeggeri: number;
    prenotazioni: number;
    incasso: number;
    incassato: number;
    prezzoMedio: number | null;
    postiSuiBus: number;
    listaAttesa: number;
    /** Partecipanti delle prenotazioni confermate e quanti risultano saliti a bordo. */
    partecipanti: number;
    saliti: number;
    costoBus: number | null;
    commissioni: number;
    /** Compenso del responsabile dell'evento; 0 se non c'è. */
    compenso: number;
    margine: number | null;
    margineAOggi: number | null;
  };
  /** Passeggeri accumulati per giorni alla partenza: giorni[i] va dal più
   *  lontano a 0; evento[i] null per i giorni non ancora arrivati. */
  ritmo: {
    giorni: number[];
    evento: (number | null)[];
    simili: (number | null)[];
    eventiSimili: number;
    criterioSimili: 'genere' | 'citta' | null;
    /** Giorni alla partenza oggi; null se l'evento è passato. */
    oggi: number | null;
  };
  sogliaPareggio: number;
  linee: RigaLineaStatistiche[];
  fermate: RigaFermataStatistiche[];
  perFonte: RigaFonteSintesi[];
}

// ---------------------------------------------------------------- Vendite e canali

export interface RigaPromoter {
  id: string | null;
  nome: string;
  codice: string;
  prenotazioni: number;
  passeggeri: number;
  incasso: number;
  incassato: number;
  commissione: number;
  /** Passeggeri per intervallo del periodo. */
  andamento: number[];
}

export interface RigaCoupon {
  codice: string;
  promoterNome: string | null;
  usi: number;
  passeggeri: number;
  /** Sconto del codice registrato sulle prenotazioni (un codice usato solo al
   *  momento del saldo non ha lo sconto registrato). */
  sconto: number;
  incasso: number;
  incassato: number;
}

export interface RigaOfferta {
  id: string;
  nome: string;
  eventoArtista: string;
  prenotazioni: number;
  passeggeri: number;
  incasso: number;
  incassato: number;
}

export interface StatisticheVendite {
  periodo: PeriodoRisposta;
  fonti: RigaFonte[];
  promoter: RigaPromoter[];
  coupon: RigaCoupon[];
  offerte: RigaOfferta[];
  /** Giorni tra prenotazione ed evento, per fasce nell'ordine (0–7 … oltre 60). */
  anticipo: { fascia: string; passeggeri: number; percentuale: number }[];
  /** Numero di prenotazioni del periodo per tipo di pagamento. */
  pagamento: {
    completo: number;
    acconto: number;
    /** Ad acconto e ancora da saldare, e quante di queste hanno la scadenza passata. */
    daSaldare: number;
    saldiScaduti: number;
    /** Euro che mancano ai saldi ancora da pagare. */
    daIncassare: number;
  };
  bundle: { prenotazioni: number; passeggeri: number; incasso: number; incassato: number; sconto: number };
}

// ---------------------------------------------------------------- Clienti

export interface StatisticheClienti {
  periodo: PeriodoRisposta;
  /** Clienti (chi ha prenotato) con almeno una prenotazione nel periodo. */
  clienti: Valore;
  /** Prima prenotazione in assoluto dentro il periodo. */
  nuovi: Valore;
  /** Avevano già prenotato prima del periodo. */
  diRitorno: Valore;
  ospiti: number;
  conAccount: number;
  /** Arrivati con "Invita un amico". */
  invitati: number;
  /** Età di chi prenota il giorno dell'evento, per fasce; null se meno di 10 persone con la data di nascita. */
  eta: { fascia: string; persone: number; percentuale: number }[] | null;
  etaNonIndicata: number;
  /** Passeggeri per città della fermata, le 10 più richieste. */
  fermate: { citta: string; passeggeri: number }[];
  altreFermate: { numero: number; passeggeri: number };
  /** Ultimi 12 mesi, per mese della prima prenotazione: % di clienti che
   *  hanno prenotato di nuovo entro mesiCoorti[i] mesi; null se non ancora trascorsi. */
  mesiCoorti: number[];
  coorti: { mese: string; etichetta: string; clienti: number; ritorno: (number | null)[] }[];
}

// ---------------------------------------------------------------- Costi e fornitori

export interface RigaMargineEvento {
  id: string;
  artista: string;
  citta: string;
  data: string;
  passeggeri: number;
  incasso: number;
  incassato: number;
  bus: number;
  costoBus: number;
  costoCompleto: boolean;
  commissioni: number;
  /** Compenso del responsabile dell'evento; 0 se non c'è. */
  compenso: number;
  /** incasso − costo bus − commissioni − compenso; con costoCompleto false il costo è parziale. */
  margine: number;
  margineAOggi: number;
}

export interface RigaFornitoreStatistiche {
  id: string;
  nome: string;
  richieste: number;
  risposte: number;
  /** % di richieste con risposta. */
  tassoRisposta: number | null;
  /** Ore tra richiesta e risposta, valore centrale. */
  oreRispostaMediana: number | null;
  scelto: number;
  prezzoMedio: number | null;
}

export interface RigaTratta {
  partenza: string;
  arrivo: string;
  prezzo: number;
  km: number | null;
  euroKm: number | null;
  data: string;
  nomeTragitto: string;
  artista: string;
}

export interface StatisticheCosti {
  periodo: PeriodoRisposta;
  /** Eventi con la data nel periodo. */
  totali: {
    incasso: number;
    incassato: number;
    costoBus: number;
    commissioni: number;
    /** Compensi dei responsabili degli eventi (collaboratori). */
    compensi: number;
    margine: number;
    margineAOggi: number;
    eventiConCostiMancanti: number;
  };
  eventi: RigaMargineEvento[];
  /** Richieste di preventivo fatte nel periodo. */
  fornitori: RigaFornitoreStatistiche[];
  /** Preventivi accettati per eventi del periodo. */
  tratte: RigaTratta[];
  /** Cancellazioni avvenute nel periodo (la data si registra da settembre 2026). */
  cancellazioni: {
    prenotazioni: number;
    passeggeri: number;
    /** Quanto era stato pagato (per un acconto non saldato, l'acconto). */
    importo: number;
    perIntervallo: { prenotazioni: number; importo: number }[];
  };
  /** Richieste di rimborso fatte nel periodo. */
  rimborsi: {
    richieste: number;
    inAttesa: number;
    approvate: number;
    rifiutate: number;
    daVariazione: number;
    /** Quanto era stato pagato dalle prenotazioni con il rimborso approvato. */
    importoApprovato: number;
  };
}

// ---------------------------------------------------------------- Bus in più

/** confermato: bus vero; linea-senza-bus: linea confermata senza bus;
 *  proposta: da confermare (raggiunge il pareggio); sotto-pareggio: bus in
 *  più che non lo raggiunge; senza-bus: passeggeri di un viaggio passato mai
 *  smistato (contano, ma non sono su un bus). */
export type TipoBusSimulato = 'confermato' | 'linea-senza-bus' | 'proposta' | 'sotto-pareggio' | 'senza-bus';

export interface LineaSimulata {
  chiave: string;
  nome: string;
  /** Città nell'ordine del percorso. */
  fermate: string[];
}

export interface BusSimulato {
  /** Stabile tra un caricamento e l'altro: ci si ricorda l'interruttore. */
  chiave: string;
  /** "Bus 2", numerato dentro la sua linea. */
  nome: string;
  riferimento: string | null;
  tipo: TipoBusSimulato;
  /** Posizione in `linee`. */
  linea: number;
  posti: number;
  /** Posizione tra i bus in più (bit della combinazione); null per un bus che parte sempre. */
  interruttore: number | null;
  /** Costo registrato, preventivo più basso o quotazione; null se non c'è. */
  costo: number | null;
  fonteCosto: 'bus' | 'preventivo' | 'quotazione' | null;
  preventivi: number;
}

export interface TragittoSimulato {
  id: string;
  nome: string;
  /** Tutti i passeggeri delle prenotazioni confermate (anche chi resta a terra). */
  passeggeri: number;
  inAttesaDiRimborso: number;
  /** Pagato davvero da tutte le prenotazioni senza quelle con un rimborso in attesa. */
  incasso: number;
  /** I loro saldi che mancano: con `incasso` è il previsto; meno quello di chi
   *  parte, è quanto vale chi resta a terra. */
  daIncassare: number;
  linee: LineaSimulata[];
  bus: BusSimulato[];
  /** esiti[combinazione][bus] = [passeggeri, incasso pagato davvero (di un
   *  acconto solo l'acconto), commissioni promoter, quote White Label, saldi
   *  ancora da incassare]; combinazione = bit i acceso se parte il bus in più i. */
  esiti: [number, number, number, number, number][][];
}

export interface EventoSimulato {
  id: string;
  artista: string;
  citta: string;
  data: string;
  anno: number;
  /** Il compenso del responsabile dell'evento, se c'è: si calcola sulla combinazione scelta (contiBusInPiu.ts). */
  compenso: RegolaCompensoEvento | null;
  tragitti: TragittoSimulato[];
}

/** FISSO in euro; per le percentuali un numero da 0 a 100. */
export interface RegolaCompensoEvento {
  tipo: 'FISSO' | 'PERCENTUALE_INCASSO' | 'PERCENTUALE_MARGINE';
  valore: number;
}

export interface StatisticheBusInPiu {
  anno: number;
  /** Anni da scegliere, dal più recente. */
  anni: number[];
  /** Tutti gli eventi ancora da fare, di ogni anno. */
  inVendita: EventoSimulato[];
  /** Eventi già passati dell'anno scelto, con i numeri veri (nessun interruttore). */
  conclusi: EventoSimulato[];
}

function query(f: FiltroPeriodo) {
  return `dal=${encodeURIComponent(f.dal)}&al=${encodeURIComponent(f.al)}&confronto=${f.confronto}`;
}

export const statisticheApi = {
  panoramica: (f: FiltroPeriodo) => api.get<StatistichePanoramica>(`/api/statistiche/panoramica?${query(f)}`),
  daGuardare: () => api.get<AvvisoStatistiche[]>('/api/statistiche/da-guardare'),
  eventi: (f: FiltroPeriodo) => api.get<StatisticheEventi>(`/api/statistiche/eventi?${query(f)}`),
  evento: (id: string) => api.get<StatisticheEvento>(`/api/statistiche/eventi/${encodeURIComponent(id)}`),
  vendite: (f: FiltroPeriodo) => api.get<StatisticheVendite>(`/api/statistiche/vendite?${query(f)}`),
  clienti: (f: FiltroPeriodo) => api.get<StatisticheClienti>(`/api/statistiche/clienti?${query(f)}`),
  costi: (f: FiltroPeriodo) => api.get<StatisticheCosti>(`/api/statistiche/costi?${query(f)}`),
  busInPiu: (anno: number) => api.get<StatisticheBusInPiu>(`/api/statistiche/bus-in-piu?anno=${anno}`),
  /** Un solo evento, per la pagina Linee (null se è già passato). */
  busInPiuEvento: (eventoId: string) => api.get<{ evento: EventoSimulato | null }>(`/api/eventi/${encodeURIComponent(eventoId)}/simulazione-bus`),
};
