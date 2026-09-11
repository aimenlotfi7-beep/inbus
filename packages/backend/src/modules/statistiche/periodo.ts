import { giornoARoma, istanteOraRoma } from '../../shared/formato.js';
import { ErroreApplicativo } from '../../shared/errors.js';

/** Il periodo delle statistiche: giorni di calendario di Roma, entrambi
 *  compresi. I conti sul calendario si fanno sui giorni (Date.UTC usato solo
 *  come calendario, senza fusi); l'istante vero serve solo verso il database:
 *  la mezzanotte di Roma, perché il server gira in UTC. */

export type Confronto = 'anno' | 'precedente' | 'nessuno';
export type Granularita = 'giorno' | 'settimana' | 'mese';

export interface Giorno {
  anno: number;
  mese: number;
  giorno: number;
}

/** Un punto dei grafici nel tempo: istanti [inizio, fine) a Roma. */
export interface Intervallo {
  etichetta: string;
  dal: Giorno;
  inizio: Date;
  fine: Date;
}

export interface Tratto {
  dal: Giorno;
  al: Giorno;
  inizio: Date;
  fine: Date;
  intervalli: Intervallo[];
}

export interface Periodo extends Tratto {
  granularita: Granularita;
  confronto: Tratto | null;
}

/** Tre anni: oltre, i grafici diventano illeggibili e le query pesanti. */
export const MAX_GIORNI_PERIODO = 1096;

const MS_GIORNO = 86_400_000;
const due = (n: number) => String(n).padStart(2, '0');
const msGiorno = (g: Giorno) => Date.UTC(g.anno, g.mese - 1, g.giorno);
function daMs(ms: number): Giorno {
  const d = new Date(ms);
  return { anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1, giorno: d.getUTCDate() };
}

/** "2026-06-15" → giorno; null se il formato o la data non sono validi (es. 2026-02-30). */
export function leggiGiorno(testo: string): Giorno | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(testo);
  if (!m) return null;
  const g = { anno: Number(m[1]), mese: Number(m[2]), giorno: Number(m[3]) };
  const verifica = daMs(msGiorno(g));
  return verifica.anno === g.anno && verifica.mese === g.mese && verifica.giorno === g.giorno ? g : null;
}

export function scriviGiorno(g: Giorno): string {
  return `${g.anno}-${due(g.mese)}-${due(g.giorno)}`;
}

export function aggiungiGiorni(g: Giorno, n: number): Giorno {
  return daMs(msGiorno(g) + n * MS_GIORNO);
}

/** Lo stesso giorno n mesi dopo (o prima, con n negativo); se quel mese è più
 *  corto diventa il suo ultimo giorno (31 marzo − 1 mese = 28 febbraio). */
export function aggiungiMesi(g: Giorno, n: number): Giorno {
  const indice = g.anno * 12 + (g.mese - 1) + n;
  const anno = Math.floor(indice / 12);
  const mese = indice - anno * 12 + 1;
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  return { anno, mese, giorno: Math.min(g.giorno, ultimo) };
}

/** Giorni di calendario da "da" ad "a" (negativo se "a" viene prima). */
export function giorniTra(da: Giorno, a: Giorno): number {
  return Math.round((msGiorno(a) - msGiorno(da)) / MS_GIORNO);
}

export function confrontaGiorni(a: Giorno, b: Giorno): number {
  return msGiorno(a) - msGiorno(b);
}

export function inizioGiornoRoma(g: Giorno): Date {
  return istanteOraRoma(g.anno, g.mese, g.giorno, 0, 0);
}

export function oggiRoma(adesso: Date = new Date()): Giorno {
  return giornoARoma(adesso);
}

const formatoGiorno = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const formatoMese = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function etichettaMese(g: Giorno): string {
  return formatoMese.format(new Date(msGiorno(g)));
}

/** Fino a un mese un punto al giorno, fino a sei mesi uno a settimana, oltre uno al mese. */
export function granularitaPer(giorni: number): Granularita {
  if (giorni <= 31) return 'giorno';
  if (giorni <= 186) return 'settimana';
  return 'mese';
}

/** Giorni, settimane contate dal primo giorno del periodo, o mesi di
 *  calendario (il primo e l'ultimo mese possono essere parziali). */
export function costruisciIntervalli(dal: Giorno, al: Giorno, granularita: Granularita): Intervallo[] {
  const intervalli: Intervallo[] = [];
  const dopoAl = aggiungiGiorni(al, 1);
  let inizio = dal;
  while (confrontaGiorni(inizio, al) <= 0) {
    const prossimo = granularita === 'giorno' ? aggiungiGiorni(inizio, 1)
      : granularita === 'settimana' ? aggiungiGiorni(inizio, 7)
        : aggiungiMesi({ anno: inizio.anno, mese: inizio.mese, giorno: 1 }, 1);
    const fine = confrontaGiorni(prossimo, dopoAl) < 0 ? prossimo : dopoAl;
    intervalli.push({
      etichetta: granularita === 'mese' ? etichettaMese(inizio) : formatoGiorno.format(new Date(msGiorno(inizio))),
      dal: inizio,
      inizio: inizioGiornoRoma(inizio),
      fine: inizioGiornoRoma(fine),
    });
    inizio = prossimo;
  }
  return intervalli;
}

function tratto(dal: Giorno, al: Giorno, granularita: Granularita): Tratto {
  return {
    dal,
    al,
    inizio: inizioGiornoRoma(dal),
    fine: inizioGiornoRoma(aggiungiGiorni(al, 1)),
    intervalli: costruisciIntervalli(dal, al, granularita),
  };
}

/** Lo stesso giorno dell'anno prima. Il 29 febbraio diventa il 1° marzo: come
 *  confine di un intervallo, così il 28 febbraio dell'anno prima resta intero. */
function unAnnoPrima(g: Giorno): Giorno {
  if (g.mese === 2 && g.giorno === 29) return { anno: g.anno - 1, mese: 3, giorno: 1 };
  return { anno: g.anno - 1, mese: g.mese, giorno: g.giorno };
}

/** Il periodo di confronto con gli STESSI intervalli del periodo scelto,
 *  spostati indietro: il punto i del grafico confronta sempre lo stesso pezzo
 *  di calendario, e gli intervalli coprono esattamente il periodo di
 *  confronto, senza buchi né sovrapposizioni. */
function trattoSpostato(p: Tratto, sposta: (g: Giorno) => Giorno): Tratto {
  const dal = sposta(p.dal);
  const dopoAl = sposta(aggiungiGiorni(p.al, 1));
  return {
    dal,
    al: confrontaGiorni(dopoAl, dal) > 0 ? aggiungiGiorni(dopoAl, -1) : dal,
    inizio: inizioGiornoRoma(dal),
    fine: inizioGiornoRoma(dopoAl),
    intervalli: p.intervalli.map((iv, i) => {
      const inizioIv = sposta(iv.dal);
      const fineIv = i + 1 < p.intervalli.length ? sposta(p.intervalli[i + 1].dal) : dopoAl;
      return { etichetta: iv.etichetta, dal: inizioIv, inizio: inizioGiornoRoma(inizioIv), fine: inizioGiornoRoma(fineIv) };
    }),
  };
}

/** Periodo scelto e periodo di confronto: lo stesso dell'anno prima, oppure
 *  quello della stessa durata che finisce il giorno prima. */
export function costruisciPeriodo(dalTesto: string, alTesto: string, confronto: Confronto): Periodo {
  const dal = leggiGiorno(dalTesto);
  const al = leggiGiorno(alTesto);
  if (!dal || !al) throw new ErroreApplicativo('Date del periodo non valide: servono nel formato AAAA-MM-GG.', 400, 'PERIODO_NON_VALIDO');
  const giorni = giorniTra(dal, al) + 1;
  if (giorni < 1) throw new ErroreApplicativo('La fine del periodo viene prima dell\'inizio.', 400, 'PERIODO_NON_VALIDO');
  if (giorni > MAX_GIORNI_PERIODO) throw new ErroreApplicativo('Il periodo può durare al massimo tre anni.', 400, 'PERIODO_NON_VALIDO');

  const granularita = granularitaPer(giorni);
  const principale = tratto(dal, al, granularita);
  const periodoConfronto = confronto === 'anno' ? trattoSpostato(principale, unAnnoPrima)
    : confronto === 'precedente' ? trattoSpostato(principale, (g) => aggiungiGiorni(g, -giorni))
      : null;
  return { ...principale, granularita, confronto: periodoConfronto };
}

/** L'intervallo che contiene l'istante, -1 se è fuori (ricerca binaria: sono in ordine). */
export function indiceIntervallo(istante: Date, intervalli: Intervallo[]): number {
  const t = istante.getTime();
  let basso = 0;
  let alto = intervalli.length - 1;
  while (basso <= alto) {
    const medio = (basso + alto) >> 1;
    if (t < intervalli[medio].inizio.getTime()) alto = medio - 1;
    else if (t >= intervalli[medio].fine.getTime()) basso = medio + 1;
    else return medio;
  }
  return -1;
}

export function periodoPerRisposta(p: Periodo) {
  return {
    dal: scriviGiorno(p.dal),
    al: scriviGiorno(p.al),
    confrontoDal: p.confronto ? scriviGiorno(p.confronto.dal) : null,
    confrontoAl: p.confronto ? scriviGiorno(p.confronto.al) : null,
    granularita: p.granularita,
    intervalli: p.intervalli.map((i) => ({ etichetta: i.etichetta, dal: scriviGiorno(i.dal) })),
  };
}
