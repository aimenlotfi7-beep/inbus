import { api } from './client';

/** Statistiche del gestionale (sezione Statistiche). Tutti gli importi sono
 *  in euro, già numeri. Le date "dal"/"al" sono giorni di Roma (YYYY-MM-DD),
 *  entrambi compresi. Contano solo le prenotazioni CONFERMATE di eventi non
 *  in bozza e non nel cestino. L'incasso è il valore delle prenotazioni: un
 *  acconto non ancora saldato conta già per il prezzo intero (quanto manca da
 *  incassare è in Vendite, pagamento.daIncassare). */

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
    costoBus: Valore;
    /** Commissioni promoter + quote White Label. */
    commissioni: Valore;
    margine: Valore;
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
  /** incasso − costo bus − commissioni; null se l'evento non ha nessun bus
   *  (con costoCompleto false il costo dei bus è parziale). */
  margine: number | null;
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
  /** null per le linee senza bus. */
  costo: number | null;
  costoCompleto: boolean;
  margine: number | null;
}

export interface RigaFermataStatistiche {
  tragittoNome: string;
  citta: string;
  attiva: boolean;
  passeggeri: number;
  incasso: number;
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
    prezzoMedio: number | null;
    postiSuiBus: number;
    listaAttesa: number;
    /** Partecipanti delle prenotazioni confermate e quanti risultano saliti a bordo. */
    partecipanti: number;
    saliti: number;
    costoBus: number | null;
    commissioni: number;
    margine: number | null;
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
}

export interface RigaOfferta {
  id: string;
  nome: string;
  eventoArtista: string;
  prenotazioni: number;
  passeggeri: number;
  incasso: number;
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
  bundle: { prenotazioni: number; passeggeri: number; incasso: number; sconto: number };
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
  bus: number;
  costoBus: number;
  costoCompleto: boolean;
  commissioni: number;
  /** incasso − costo bus − commissioni; con costoCompleto false il costo è parziale. */
  margine: number;
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
    costoBus: number;
    commissioni: number;
    margine: number;
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
};
