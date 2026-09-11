import { aggiungiGiorni, aggiungiMesi, confrontaGiorni, etichettaMese, scriviGiorno, type Giorno } from './periodo.js';

/** I conti delle statistiche che non leggono il database: si provano da
 *  soli in calcoli.test.ts. */

// ---------------------------------------------------------------- Fonti

export type TipoFonte = 'promoter' | 'white_label' | 'campagna' | 'utm_non_registrata' | 'sito';

export const NOMI_TIPO_FONTE: Record<TipoFonte, string> = {
  sito: 'Sito',
  promoter: 'Promoter',
  white_label: 'White Label',
  campagna: 'Campagne',
  utm_non_registrata: 'Link con UTM non registrati',
};

export interface DatiFonte {
  promoterCodice: string | null;
  canaleVendita: string;
  whiteLabelId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface CampagnaFonte {
  id: string;
  nome: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface Fonte {
  tipo: TipoFonte;
  chiave: string;
  nome: string;
}

/** La fonte (una sola) di una prenotazione. Stesso ordine del report
 *  "Fatturato per fonte" in Campagne, con il White Label in più: codice
 *  promoter, widget White Label, campagna registrata (stessi utm_source,
 *  utm_medium e utm_campaign), UTM senza campagna, altrimenti il sito. */
export function fonteDi(
  r: DatiFonte,
  campagne: CampagnaFonte[],
  nomiPromoter: Map<string, string>,
  nomiWhiteLabel: Map<string, string>,
): Fonte {
  if (r.promoterCodice) {
    return { tipo: 'promoter', chiave: `promoter:${r.promoterCodice}`, nome: nomiPromoter.get(r.promoterCodice) ?? `Codice ${r.promoterCodice}` };
  }
  if (r.canaleVendita === 'WHITE_LABEL') {
    const id = r.whiteLabelId ?? '';
    return { tipo: 'white_label', chiave: `white_label:${id}`, nome: nomiWhiteLabel.get(id) ?? 'White Label' };
  }
  if (r.utmSource) {
    const campagna = campagne.find((c) => c.utmSource === r.utmSource
      && (c.utmMedium ?? null) === (r.utmMedium ?? null)
      && (c.utmCampaign ?? null) === (r.utmCampaign ?? null));
    if (campagna) return { tipo: 'campagna', chiave: `campagna:${campagna.id}`, nome: campagna.nome };
    return {
      tipo: 'utm_non_registrata',
      chiave: `utm:${r.utmSource}/${r.utmMedium ?? ''}`,
      nome: r.utmMedium ? `${r.utmSource} / ${r.utmMedium}` : r.utmSource,
    };
  }
  return { tipo: 'sito', chiave: 'sito', nome: 'Sito' };
}

// ---------------------------------------------------------------- Fasce

export const FASCE_ANTICIPO = [
  { etichetta: '0–7 giorni', fino: 7 },
  { etichetta: '8–14 giorni', fino: 14 },
  { etichetta: '15–30 giorni', fino: 30 },
  { etichetta: '31–60 giorni', fino: 60 },
  { etichetta: 'oltre 60 giorni', fino: Infinity },
] as const;

/** Chi prenota dopo la data dell'evento (capita per l'orario) conta in 0–7. */
export function fasciaAnticipo(giorni: number): number {
  const g = Math.max(0, giorni);
  return FASCE_ANTICIPO.findIndex((f) => g <= f.fino);
}

export const FASCE_ETA = [
  { etichetta: 'meno di 18', fino: 17 },
  { etichetta: '18–24', fino: 24 },
  { etichetta: '25–34', fino: 34 },
  { etichetta: '35–44', fino: 44 },
  { etichetta: '45–54', fino: 54 },
  { etichetta: '55 e oltre', fino: Infinity },
] as const;

/** Sotto questo numero di persone le fasce d'età non si mostrano: con pochi
 *  clienti si riconoscerebbero le persone. */
export const MINIMO_PERSONE_FASCE = 10;

export function etaAl(nascita: Giorno, giorno: Giorno): number {
  let eta = giorno.anno - nascita.anno;
  if (giorno.mese < nascita.mese || (giorno.mese === nascita.mese && giorno.giorno < nascita.giorno)) eta -= 1;
  return eta;
}

/** null per un'età impossibile (data di nascita scritta male). */
export function fasciaEta(eta: number): number | null {
  if (!Number.isFinite(eta) || eta < 0 || eta > 110) return null;
  return FASCE_ETA.findIndex((f) => eta <= f.fino);
}

// ---------------------------------------------------------------- Numeri e raccolte

export function raggruppa<T>(righe: T[], chiave: (r: T) => string): Map<string, T[]> {
  const gruppi = new Map<string, T[]>();
  for (const r of righe) {
    const k = chiave(r);
    const gruppo = gruppi.get(k);
    if (gruppo) gruppo.push(r);
    else gruppi.set(k, [r]);
  }
  return gruppi;
}

/** A blocchi: una query non accetta più di ~65.000 parametri. */
export function aBlocchi<T>(valori: T[], dimensione: number): T[][] {
  const blocchi: T[][] = [];
  for (let i = 0; i < valori.length; i += dimensione) blocchi.push(valori.slice(i, i + dimensione));
  return blocchi;
}

/** Percentuale con un decimale; 0 se il totale è 0. */
export function percentuale(parte: number, totale: number): number {
  return totale > 0 ? Math.round((parte / totale) * 1000) / 10 : 0;
}

export function arrotondaEuro(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mediana(valori: number[]): number | null {
  if (valori.length === 0) return null;
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = ordinati.length >> 1;
  return ordinati.length % 2 === 1 ? ordinati[meta] : (ordinati[meta - 1] + ordinati[meta]) / 2;
}

// ---------------------------------------------------------------- Ritmo di vendita

/** Passeggeri accumulati per giorni alla partenza, dal più lontano
 *  (maxGiorni) fino a 0: al giorno d conta chi ha prenotato con almeno d
 *  giorni di anticipo. Chi ha prenotato prima di maxGiorni conta dal primo
 *  punto, chi ha prenotato il giorno stesso (o dopo) solo all'ultimo. */
export function curvaCumulativa(prenotazioni: { giorniPrima: number; passeggeri: number }[], maxGiorni: number): number[] {
  const perGiorno = new Array<number>(maxGiorni + 1).fill(0);
  for (const p of prenotazioni) {
    perGiorno[Math.min(maxGiorni, Math.max(0, Math.floor(p.giorniPrima)))] += p.passeggeri;
  }
  const curva: number[] = [];
  let somma = 0;
  for (let d = maxGiorni; d >= 0; d--) {
    somma += perGiorno[d];
    curva.push(somma);
  }
  return curva;
}

/** Media punto per punto di curve della stessa lunghezza, con un decimale. */
export function mediaCurve(curve: number[][]): number[] | null {
  if (curve.length === 0) return null;
  return curve[0].map((_, i) => Math.round((curve.reduce((s, c) => s + c[i], 0) / curve.length) * 10) / 10);
}

// ---------------------------------------------------------------- Coorti

export const MESI_COORTI = [1, 3, 6, 12];

export interface PrenotazioneCliente {
  utenteId: string;
  /** Giorno (a Roma) in cui è stata fatta. */
  giorno: Giorno;
}

/** Per ogni mese degli ultimi `mesiIndietro` (fino a quello di oggi): i
 *  clienti alla loro prima prenotazione in assoluto in quel mese, e la % di
 *  loro che ha prenotato di nuovo, in un giorno successivo, entro 1, 3, 6, 12
 *  mesi. null finché non sono passati quei mesi per tutti i clienti del mese.
 *  Servono TUTTE le prenotazioni dei clienti, anche le più vecchie: altrimenti
 *  la "prima" non sarebbe davvero la prima. */
export function calcolaCoorti(prenotazioni: PrenotazioneCliente[], oggi: Giorno, mesiIndietro = 12) {
  const perCliente = new Map<string, Giorno[]>();
  for (const p of prenotazioni) {
    const giorni = perCliente.get(p.utenteId);
    if (giorni) giorni.push(p.giorno);
    else perCliente.set(p.utenteId, [p.giorno]);
  }

  const primoMese = aggiungiMesi({ anno: oggi.anno, mese: oggi.mese, giorno: 1 }, -(mesiIndietro - 1));
  const coorti = new Map<string, { inizio: Giorno; clienti: number; tornati: number[] }>();
  for (let i = 0; i < mesiIndietro; i++) {
    const inizio = aggiungiMesi(primoMese, i);
    coorti.set(scriviGiorno(inizio).slice(0, 7), { inizio, clienti: 0, tornati: MESI_COORTI.map(() => 0) });
  }

  for (const giorni of perCliente.values()) {
    giorni.sort(confrontaGiorni);
    const primo = giorni[0];
    const coorte = coorti.get(scriviGiorno(primo).slice(0, 7));
    if (!coorte) continue;
    coorte.clienti += 1;
    const successivo = giorni.find((g) => confrontaGiorni(g, primo) > 0);
    if (!successivo) continue;
    MESI_COORTI.forEach((mesi, i) => {
      if (confrontaGiorni(successivo, aggiungiMesi(primo, mesi)) <= 0) coorte.tornati[i] += 1;
    });
  }

  return [...coorti.entries()].map(([mese, c]) => {
    const ultimoGiorno = aggiungiGiorni(aggiungiMesi(c.inizio, 1), -1);
    return {
      mese,
      etichetta: etichettaMese(c.inizio),
      clienti: c.clienti,
      // Il valore esce il giorno DOPO la fine della finestra: fino a quel
      // giorno qualcuno può ancora prenotare.
      ritorno: MESI_COORTI.map((mesi, i) => (c.clienti > 0 && confrontaGiorni(aggiungiMesi(ultimoGiorno, mesi), oggi) < 0
        ? percentuale(c.tornati[i], c.clienti)
        : null)),
    };
  });
}
