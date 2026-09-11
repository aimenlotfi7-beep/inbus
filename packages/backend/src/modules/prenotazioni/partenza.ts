import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, fermate, lineaFermate, linee, tragitti } from '../../db/schema.js';
import { giornoARoma, istanteOraRoma, leggiOrario, orarioLeggibile } from '../../shared/formato.js';

/** Un solo posto per la regola "24 ore prima della partenza": da quel
 *  momento si smistano i passeggeri sui bus, parte il biglietto con il bus,
 *  il cliente lo scarica e il tour leader vede la lista. Tutto nell'ora di
 *  Roma: il server gira in UTC. */
export const ANTICIPO_SMISTAMENTO_MS = 24 * 60 * 60 * 1000;

/** Dopo l'orario di partenza lo smistamento assegna ancora il bus per 2 ore:
 *  copre un bus aggiunto all'ultimo momento o una partenza in ritardo. Poi
 *  una prenotazione rimasta senza bus resta così. */
export const TOLLERANZA_DOPO_PARTENZA_MS = 2 * 60 * 60 * 1000;

/** Chi legge dal database: db, oppure una transazione già aperta. */
export type Lettore = Pick<typeof db, 'select'>;

/** Quello che serve per calcolare le partenze di un tragitto: la data
 *  dell'evento e le fermate nell'ordine del percorso. */
export interface OrariTragitto {
  eventoData: Date;
  fermate: { citta: string; orario: string | null }[];
}

export interface TempiPartenza {
  partenza: Date;
  /** Partenza meno 24 ore. */
  disponibileDal: Date;
  /** Partenza più 2 ore: fin qui lo smistamento può ancora assegnare il bus. */
  smistabileFinoAl: Date;
  /** L'orario della fermata ("08:05") se ce l'ha — mai quello di riserva. */
  orarioFermata: string | null;
}

/** Partenza = giorno dell'evento (a Roma) + orario della fermata (ora di
 *  Roma). Conta l'orario ATTUALE della fermata (può cambiare dopo la
 *  vendita), poi quello salvato sulla prenotazione; se la fermata non ne ha,
 *  il primo orario disponibile del tragitto; altrimenti l'ora dell'evento. */
export function calcolaTempi(orari: OrariTragitto, fermataCitta: string | null, orarioSalvato: string | null = null): TempiPartenza {
  const fermata = fermataCitta !== null ? orari.fermate.find((f) => f.citta === fermataCitta) : undefined;
  const orarioFermata = orarioLeggibile(fermata?.orario) ?? orarioLeggibile(orarioSalvato);
  const orario = leggiOrario(orarioFermata) ?? orari.fermate.map((f) => leggiOrario(f.orario)).find((o) => o !== null) ?? null;
  let partenza: Date;
  if (orario) {
    const giorno = giornoARoma(orari.eventoData);
    partenza = istanteOraRoma(giorno.anno, giorno.mese, giorno.giorno, orario.ore, orario.minuti);
  } else {
    partenza = new Date(orari.eventoData);
  }
  return {
    partenza,
    disponibileDal: new Date(partenza.getTime() - ANTICIPO_SMISTAMENTO_MS),
    smistabileFinoAl: new Date(partenza.getTime() + TOLLERANZA_DOPO_PARTENZA_MS),
    orarioFermata,
  };
}

/** La prima partenza di un elenco (quella che arriva prima nel tempo). */
export function primaPartenza(tempi: TempiPartenza[]): TempiPartenza | null {
  return tempi.reduce<TempiPartenza | null>((prima, t) => (prima === null || t.partenza < prima.partenza ? t : prima), null);
}

export async function leggiOrariTragitto(tragittoId: string, lettore: Lettore = db): Promise<OrariTragitto | null> {
  const [riga] = await lettore.select({ eventoData: eventi.data }).from(tragitti)
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .where(eq(tragitti.id, tragittoId)).limit(1);
  if (!riga) return null;
  const righeFermate = await lettore.select({ citta: fermate.citta, orario: fermate.orario }).from(fermate)
    .where(eq(fermate.tragittoId, tragittoId)).orderBy(asc(fermate.ordine));
  return { eventoData: riga.eventoData, fermate: righeFermate };
}

/** Partenza di UNA prenotazione (la sua fermata). */
export async function tempiPrenotazione(p: { tragittoId: string; fermataCitta: string; fermataOrario: string | null }): Promise<TempiPartenza | null> {
  const orari = await leggiOrariTragitto(p.tragittoId);
  return orari ? calcolaTempi(orari, p.fermataCitta, p.fermataOrario) : null;
}

/** Partenza di un bus: la prima tra le fermate della sua linea. null per
 *  un bus senza linea (vecchio sistema). */
export async function tempiBus(busId: string): Promise<TempiPartenza | null> {
  const [bus] = await db.select({ lineaId: linee.id, tragittoId: linee.tragittoId }).from(busFisici)
    .innerJoin(linee, eq(linee.id, busFisici.lineaId))
    .where(eq(busFisici.id, busId)).limit(1);
  if (!bus) return null;
  const orari = await leggiOrariTragitto(bus.tragittoId);
  if (!orari) return null;
  const fermateLinea = await db.select({ citta: fermate.citta }).from(lineaFermate)
    .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
    .where(eq(lineaFermate.lineaId, bus.lineaId));
  if (fermateLinea.length === 0) return calcolaTempi(orari, null);
  return primaPartenza(fermateLinea.map((f) => calcolaTempi(orari, f.citta)));
}
