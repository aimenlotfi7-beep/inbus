import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, fermate, lineaFermate, linee, prenotazioni, tragitti } from '../../db/schema.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import type { Lettore } from '../prenotazioni/partenza.js';

/** Linee da confermare, create e tolte in automatico (pagina "Da confermare").
 *
 *  Regole decise dal proprietario:
 *  - quando i passeggeri confermati di un tragitto arrivano alla soglia di
 *    pareggio (il riquadro "Pareggio": una percentuale dei posti del
 *    preventivo, in Impostazioni) nasce una linea da confermare;
 *  - ogni volta che i passeggeri arrivano ai posti delle linee che ci sono
 *    già, ne nasce un'altra, sempre da confermare (es. 50 passeggeri con un
 *    bus da 50: serve la seconda);
 *  - a confermarla è l'admin, con i dati del bus ed eventualmente le fermate
 *    (eventiService.confermaLinea): solo allora la linea ha un bus e lo
 *    smistamento per età ci mette i passeggeri;
 *  - una linea da confermare che non serve più (cancellazioni, un bus in più
 *    su un'altra linea) sparisce da sola; le linee confermate non si toccano.
 *
 *  Le vendite non si fermano mai per i posti dei bus (si fermano solo con
 *  "Ferma vendite" sull'evento): una linea da confermare non ha bus, quindi
 *  non cambia i posti in vendita e non avvisa nessuno.
 *
 *  Posti per il calcolo: una linea con bus conta i posti dei suoi bus; una
 *  linea da confermare, o confermata ma senza bus, conta i posti del
 *  preventivo (senza preventivo, i posti per bus delle Impostazioni). */

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

export interface EsitoAllineamento { create: number; tolte: number }

/** Quante linee da confermare servono. Senza linee confermate la prima nasce
 *  solo dalla soglia di pareggio (null = nessun preventivo, nessuna soglia);
 *  poi ne serve una in più ogni volta che i passeggeri arrivano ai posti di
 *  tutte le linee. */
export function lineeDaConfermareNecessarie(dati: {
  passeggeri: number; postiPareggio: number | null; postiPerLinea: number; postiLineeConfermate: number; lineeConfermate: number;
}): number {
  const { passeggeri, postiPareggio, postiPerLinea, postiLineeConfermate, lineeConfermate } = dati;
  if (passeggeri <= 0 || postiPerLinea <= 0) return 0;
  if (lineeConfermate === 0 && (postiPareggio === null || passeggeri < Math.max(1, postiPareggio))) return 0;
  let necessarie = 0;
  while (passeggeri >= postiLineeConfermate + necessarie * postiPerLinea && necessarie < 100) necessarie++;
  return necessarie;
}

interface StatoLinee {
  necessarie: number;
  bozze: { id: string; nome: string; ordine: number; creatoIl: Date }[];
  tutte: { id: string; nome: string; ordine: number }[];
}

/** Legge il tragitto e calcola quante linee da confermare servono. null se il
 *  tragitto non è in vendita, o l'evento è passato o nel cestino: lì le linee
 *  restano come sono. */
async function leggiStato(lettore: Lettore, tragittoId: string, soglia: number, postiPerBusImpostazioni: number): Promise<StatoLinee | null> {
  const [t] = await lettore.select({
    stato: tragitti.stato, attivo: tragitti.attivo, eliminatoIl: tragitti.eliminatoIl, preventivoPostiBus: tragitti.preventivoPostiBus,
    eventoData: eventi.data, eventoEliminatoIl: eventi.eliminatoIl,
  }).from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId)).where(eq(tragitti.id, tragittoId)).limit(1);
  if (!t || !t.attivo || t.eliminatoIl || t.eventoEliminatoIl || (t.stato !== 'PREZZATO' && t.stato !== 'CONFERMATO')) return null;
  if (t.eventoData.getTime() < Date.now() - UN_GIORNO_MS) return null;

  const [somma] = await lettore.select({ passeggeri: sql<number>`coalesce(sum(${prenotazioni.passeggeri}), 0)::int` }).from(prenotazioni)
    .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')));
  const righeLinee = await lettore.select({ id: linee.id, nome: linee.nome, ordine: linee.ordine, daConfermare: linee.daConfermare, creatoIl: linee.creatoIl })
    .from(linee).where(eq(linee.tragittoId, tragittoId));
  const righeBus = righeLinee.length
    ? await lettore.select({ lineaId: busFisici.lineaId, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.lineaId, righeLinee.map((l) => l.id)))
    : [];
  const postiBusPerLinea = new Map<string, number>();
  for (const b of righeBus) if (b.lineaId) postiBusPerLinea.set(b.lineaId, (postiBusPerLinea.get(b.lineaId) ?? 0) + (b.postiBus ?? 0));

  const postiPerLinea = t.preventivoPostiBus ?? postiPerBusImpostazioni;
  // Una linea da confermare con un bus (non dovrebbe capitare: il bus arriva
  // solo confermandola) conta come confermata e non si toglie.
  const bozze = righeLinee.filter((l) => l.daConfermare && !postiBusPerLinea.has(l.id));
  const confermate = righeLinee.filter((l) => !bozze.includes(l));
  const postiLineeConfermate = confermate.reduce((tot, l) => tot + (postiBusPerLinea.get(l.id) ?? postiPerLinea), 0);

  const necessarie = lineeDaConfermareNecessarie({
    passeggeri: Number(somma?.passeggeri ?? 0),
    postiPareggio: t.preventivoPostiBus ? Math.round(t.preventivoPostiBus * (soglia / 100)) : null,
    postiPerLinea,
    postiLineeConfermate,
    lineeConfermate: confermate.length,
  });
  return { necessarie, bozze, tutte: righeLinee };
}

async function allinea(tragittoId: string): Promise<EsitoAllineamento> {
  const [soglia, postiPerBus] = await Promise.all([leggiSogliaOccupazionePareggio(), leggiPostiPerBus()]);
  // Prima senza blocchi: quasi sempre non c'è niente da cambiare.
  const primaLettura = await leggiStato(db, tragittoId, soglia, postiPerBus);
  if (!primaLettura || primaLettura.necessarie === primaLettura.bozze.length) return { create: 0, tolte: 0 };

  return db.transaction(async (tx) => {
    const esito: EsitoAllineamento = { create: 0, tolte: 0 };
    // Blocca il tragitto: due prenotazioni nello stesso istante non creano
    // due volte la stessa linea, e una conferma in corso aspetta.
    const [bloccato] = await tx.select({ id: tragitti.id }).from(tragitti).where(eq(tragitti.id, tragittoId)).for('update').limit(1);
    if (!bloccato) return esito;
    const stato = await leggiStato(tx, tragittoId, soglia, postiPerBus);
    if (!stato) return esito;

    if (stato.necessarie > stato.bozze.length) {
      const righeFermate = await tx.select({ id: fermate.id, orario: fermate.orario, ordine: fermate.ordine }).from(fermate)
        .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true)));
      if (righeFermate.length === 0) return esito;
      // Per orario, come creaLinea; quelle senza orario in fondo.
      const fermateOrdinate = [...righeFermate].sort((a, b) => {
        if (!a.orario && !b.orario) return a.ordine - b.ordine;
        if (!a.orario) return 1;
        if (!b.orario) return -1;
        return a.orario.localeCompare(b.orario);
      });
      // Stessa numerazione di creaLinea: il numero dopo il più alto.
      let numero = stato.tutte.reduce((max, l) => Math.max(max, Number(/^Linea (\d+)$/.exec(l.nome)?.[1] ?? 0)), stato.tutte.length);
      let ordine = stato.tutte.reduce((max, l) => Math.max(max, l.ordine + 1), 0);
      for (let i = stato.bozze.length; i < stato.necessarie; i++) {
        numero += 1;
        const [nuova] = await tx.insert(linee).values({ tragittoId, nome: `Linea ${numero}`, ordine, daConfermare: true }).returning({ id: linee.id });
        ordine += 1;
        await tx.insert(lineaFermate).values(fermateOrdinate.map((f, posizione) => ({ lineaId: nuova.id, fermataId: f.id, ordine: posizione })));
        esito.create += 1;
      }
    } else if (stato.necessarie < stato.bozze.length) {
      // Via le ultime create: restano i numeri più bassi.
      const daTogliere = [...stato.bozze]
        .sort((a, b) => b.creatoIl.getTime() - a.creatoIl.getTime() || b.ordine - a.ordine)
        .slice(0, stato.bozze.length - stato.necessarie);
      await tx.delete(linee).where(and(inArray(linee.id, daTogliere.map((l) => l.id)), eq(linee.daConfermare, true)));
      esito.tolte = daTogliere.length;
    }
    return esito;
  });
}

export const lineeDaConfermareService = {
  allinea,

  /** Dopo una prenotazione, una cancellazione, un preventivo o un cambio di
   *  linee e bus. Non lancia mai: la modifica è già salvata, e in caso di
   *  problemi ci riprova il giro dell'ora. */
  async allineaSubito(tragittoId: string): Promise<void> {
    try {
      const { create, tolte } = await allinea(tragittoId);
      if (create > 0 || tolte > 0) console.log(`[linee da confermare] tragitto ${tragittoId}: ${create} create, ${tolte} tolte.`);
    } catch (err) {
      console.error(`[linee da confermare] tragitto ${tragittoId} non aggiornato (ci riprova il giro dell'ora):`, err);
    }
  },

  /** allineaSubito sul tragitto del bus. Non lancia mai. */
  async allineaSubitoPerBus(busId: string): Promise<void> {
    try {
      const [bus] = await db.select({ tragittoId: linee.tragittoId }).from(busFisici)
        .innerJoin(linee, eq(linee.id, busFisici.lineaId))
        .where(eq(busFisici.id, busId)).limit(1);
      if (bus) await lineeDaConfermareService.allineaSubito(bus.tragittoId);
    } catch (err) {
      console.error(`[linee da confermare] bus ${busId}: tragitto non aggiornato (ci riprova il giro dell'ora):`, err);
    }
  },

  /** Il giro di ogni ora (e all'avvio): tutti i tragitti in vendita di eventi
   *  non passati. */
  async allineaTutte(): Promise<EsitoAllineamento> {
    const righe = await db.select({ id: tragitti.id }).from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(
        eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']),
        isNull(eventi.eliminatoIl), gte(eventi.data, new Date(Date.now() - UN_GIORNO_MS)),
      ));
    const totale: EsitoAllineamento = { create: 0, tolte: 0 };
    for (const { id } of righe) {
      try {
        const esito = await allinea(id);
        totale.create += esito.create;
        totale.tolte += esito.tolte;
      } catch (err) {
        console.error(`[linee da confermare] tragitto ${id} non aggiornato:`, err);
      }
    }
    return totale;
  },
};
