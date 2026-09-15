/** Come si riempiono i bus di un tragitto: la stessa regola per lo
 *  smistamento vero (smistamento.service.ts) e per decidere quando proporre
 *  un bus o una linea (eventi/linee-da-confermare.service.ts). Nessun
 *  database qui: si prova da sola in riempimento-bus.test.ts.
 *
 *  Regole decise dal proprietario (settembre 2026):
 *  - l'unità è la prenotazione intera: un gruppo non si divide mai;
 *  - ordine per età media, dal più grande al più giovane (a parità, chi ha
 *    prenotato prima); senza nessuna data di nascita, in fondo;
 *  - un gruppo sale solo sui bus delle linee che si fermano alla sua fermata,
 *    e prova prima quelli della linea che parte più vicino alla sua fermata
 *    (chi sale a Saronno prova la linea che parte da Saronno prima di quella
 *    che parte da Como); a parità, linee e bus nell'ordine in cui sono nati;
 *  - va nel primo bus con abbastanza posti, mai oltre la capienza; se non
 *    entra da nessuna parte resta senza posto;
 *  - chi ha già un bus resta dov'è. */

const ANNO_MS = 365.2425 * 24 * 60 * 60 * 1000;

export interface GruppoPasseggeri {
  id: string;
  fermataCitta: string;
  passeggeri: number;
  eta: number | null;
  creataIl: Date;
  /** Il bus già assegnato: resta lì e occupa i suoi posti. */
  busId: string | null;
}

export interface BusDaRiempire {
  busId: string;
  postiBus: number;
  /** Le città in cui si ferma la sua linea. */
  fermate: Set<string>;
  /** Posizione nel percorso della prima fermata della sua linea (0 = la partenza del tragitto). */
  primaFermata: number;
}

export interface CaricoBus {
  passeggeri: number;
  prenotazioni: number;
  sommaEta: number;
  passeggeriConEta: number;
  /** Passeggeri per città di salita. */
  perFermata: Map<string, number>;
}

export interface EsitoRiempimento<G extends GruppoPasseggeri> {
  carico: Map<string, CaricoBus>;
  /** Solo i gruppi senza bus che hanno trovato posto: gruppo → bus. */
  assegnazioni: Map<string, string>;
  senzaPosto: G[];
}

/** Età media (in anni, alla data dell'evento) dei partecipanti che hanno la
 *  data di nascita; se nessuno ce l'ha, quella del titolare; null se manca
 *  anche quella. */
export function etaPrenotazione(dateNascitaPartecipanti: (Date | null)[], dataNascitaTitolare: Date | null, riferimento: Date): number | null {
  const conData = dateNascitaPartecipanti.filter((d): d is Date => d !== null);
  const date = conData.length > 0 ? conData : dataNascitaTitolare ? [dataNascitaTitolare] : [];
  if (date.length === 0) return null;
  return date.reduce((somma, d) => somma + (riferimento.getTime() - d.getTime()) / ANNO_MS, 0) / date.length;
}

export function confrontaPerEta(a: GruppoPasseggeri, b: GruppoPasseggeri): number {
  if (a.eta !== b.eta) {
    if (a.eta === null) return 1;
    if (b.eta === null) return -1;
    return b.eta - a.eta;
  }
  const creazione = a.creataIl.getTime() - b.creataIl.getTime();
  if (creazione !== 0) return creazione;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Riempie i bus (nell'ordine in cui arrivano: linee e bus per data di
 *  nascita). I gruppi già assegnati restano fermi; gli altri in ordine di età. */
export function riempiBus<G extends GruppoPasseggeri>(gruppi: G[], bus: BusDaRiempire[]): EsitoRiempimento<G> {
  const carico = new Map<string, CaricoBus>(bus.map((b) => [b.busId, { passeggeri: 0, prenotazioni: 0, sommaEta: 0, passeggeriConEta: 0, perFermata: new Map() }]));
  const aggiungi = (busId: string, g: GruppoPasseggeri) => {
    const c = carico.get(busId);
    if (!c) return; // bus che non è tra questi (dati vecchi): non conta
    c.passeggeri += g.passeggeri;
    c.prenotazioni += 1;
    c.perFermata.set(g.fermataCitta, (c.perFermata.get(g.fermataCitta) ?? 0) + g.passeggeri);
    if (g.eta !== null) {
      c.sommaEta += g.eta * g.passeggeri;
      c.passeggeriConEta += g.passeggeri;
    }
  };
  for (const g of gruppi) if (g.busId) aggiungi(g.busId, g);

  // Prima la linea che parte più vicino alla fermata (la prima fermata più avanti), poi l'ordine di nascita.
  const posizione = new Map(bus.map((b, i) => [b.busId, i]));
  const busInOrdine = [...bus].sort((a, b) => b.primaFermata - a.primaFermata || posizione.get(a.busId)! - posizione.get(b.busId)!);

  const assegnazioni = new Map<string, string>();
  const senzaPosto: G[] = [];
  for (const g of gruppi.filter((x) => !x.busId).sort(confrontaPerEta)) {
    const scelto = busInOrdine.find((b) => b.fermate.has(g.fermataCitta) && b.postiBus - (carico.get(b.busId)?.passeggeri ?? 0) >= g.passeggeri);
    if (!scelto) {
      senzaPosto.push(g);
      continue;
    }
    assegnazioni.set(g.id, scelto.busId);
    aggiungi(scelto.busId, g);
  }
  return { carico, assegnazioni, senzaPosto };
}

/** La prima fermata di una linea nel percorso (le città nell'ordine del
 *  tragitto); una linea senza fermate note va in fondo alle preferenze. */
export function primaFermataDellaLinea(cittaLinea: Iterable<string>, ordineCitta: string[]): number {
  const indici = [...cittaLinea].map((c) => ordineCitta.indexOf(c)).filter((i) => i >= 0);
  return indici.length > 0 ? Math.min(...indici) : -1;
}
