import { and, eq, inArray, isNull, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tour, tourEventi, eventi, tragitti, fermate, immaginiEvento } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import type { TourInput } from './tour.dto.js';

function slugDa(testo: string) {
  return testo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tour';
}
async function slugUnivoco(base: string, idDaEscludere?: string) {
  for (let n = 0; n < 50; n++) {
    const candidato = n === 0 ? base : `${base}-${n + 1}`;
    const [esiste] = await db.select({ id: tour.id }).from(tour)
      .where(idDaEscludere ? and(eq(tour.slug, candidato), sql`${tour.id} != ${idDaEscludere}`) : eq(tour.slug, candidato)).limit(1);
    if (!esiste) return candidato;
  }
  return `${base}-${Date.now()}`;
}

/** Prezzo minimo (fermata + extra) tra i tragitti VENDIBILI di una
 *  lista di eventi — una query sola, non una per evento. Usata sia per
 *  la card virtuale del tour (il minimo tra TUTTE le date) sia per il
 *  prezzo di ogni singola data nella pagina del tour. */
async function prezziMinimiPerEvento(eventiIds: string[]): Promise<Map<string, number>> {
  if (eventiIds.length === 0) return new Map();
  const righe = await db.select({ eventoId: tragitti.eventoId, prezzo: fermate.prezzo, extra: tragitti.prezzoExtra })
    .from(fermate).innerJoin(tragitti, eq(tragitti.id, fermate.tragittoId))
    .where(and(
      inArray(tragitti.eventoId, eventiIds), inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']),
      eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), eq(fermate.attivo, true), sql`${fermate.prezzo} IS NOT NULL`,
    ));
  const minimi = new Map<string, number>();
  for (const r of righe) {
    const totale = Number(r.prezzo) + Number(r.extra ?? 0);
    const attuale = minimi.get(r.eventoId);
    if (attuale === undefined || totale < attuale) minimi.set(r.eventoId, totale);
  }
  return minimi;
}

/** Quali eventi sono vendibili (stesso criterio usato ovunque nel
 *  sito): almeno un tragitto prezzato/confermato, attivo, con posti, e
 *  vendite non fermate dal gestionale. */
async function vendibilitaEventi(eventiIds: string[]): Promise<Map<string, boolean>> {
  if (eventiIds.length === 0) return new Map();
  const righe = await db.select({ eventoId: tragitti.eventoId }).from(tragitti)
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .where(and(inArray(tragitti.eventoId, eventiIds), inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), sql`${tragitti.postiDisponibili} > 0`, eq(eventi.venditeFermate, false)));
  const ok = new Set(righe.map((r) => r.eventoId));
  return new Map(eventiIds.map((id) => [id, ok.has(id)]));
}

export const tourService = {
  async list() {
    const righe = await db.select().from(tour).where(isNull(tour.eliminatoIl)).orderBy(desc(tour.creatoIl));
    if (righe.length === 0) return [];
    const conteggi = await db.select({ tourId: tourEventi.tourId, n: sql<number>`count(*)::int` }).from(tourEventi)
      .where(inArray(tourEventi.tourId, righe.map((r) => r.id))).groupBy(tourEventi.tourId);
    const nPerTour = new Map(conteggi.map((c) => [c.tourId, c.n]));
    return righe.map((t) => ({ ...t, numeroEventi: nPerTour.get(t.id) ?? 0 }));
  },

  async dettaglio(id: string) {
    const [t] = await db.select().from(tour).where(and(eq(tour.id, id), isNull(tour.eliminatoIl))).limit(1);
    if (!t) throw new NonTrovato('Tour');
    const membri = await db.select({ e: eventi, ordine: tourEventi.ordine }).from(tourEventi)
      .innerJoin(eventi, eq(eventi.id, tourEventi.eventoId)).where(eq(tourEventi.tourId, id));
    membri.sort((a, b) => a.ordine - b.ordine);
    return { ...t, eventi: membri.map((m) => ({ id: m.e.id, artista: m.e.artista, data: m.e.data, citta: m.e.citta, luogo: m.e.luogo, slug: m.e.slug, eliminato: !!m.e.eliminatoIl })) };
  },

  async create(input: TourInput) {
    const slug = await slugUnivoco(slugDa(input.slug?.trim() || input.nome));
    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(tour).values({ nome: input.nome, slug, copertinaUrl: input.copertinaUrl ?? null, descrizione: input.descrizione ?? null, descrizioneSeo: input.descrizioneSeo ?? null }).returning();
      await tx.insert(tourEventi).values(input.eventiIds.map((eventoId, ordine) => ({ tourId: nuovo.id, eventoId, ordine })));
      return nuovo;
    });
  },

  async update(id: string, input: TourInput) {
    const [esistente] = await db.select().from(tour).where(eq(tour.id, id)).limit(1);
    if (!esistente) throw new NonTrovato('Tour');
    const slug = input.slug?.trim() && input.slug.trim() !== esistente.slug ? await slugUnivoco(slugDa(input.slug), id) : esistente.slug;
    return db.transaction(async (tx) => {
      const [agg] = await tx.update(tour).set({ nome: input.nome, slug, copertinaUrl: input.copertinaUrl ?? null, descrizione: input.descrizione ?? null, descrizioneSeo: input.descrizioneSeo ?? null }).where(eq(tour.id, id)).returning();
      await tx.delete(tourEventi).where(eq(tourEventi.tourId, id));
      await tx.insert(tourEventi).values(input.eventiIds.map((eventoId, ordine) => ({ tourId: id, eventoId, ordine })));
      return agg;
    });
  },

  async remove(id: string) {
    const [esistente] = await db.select().from(tour).where(eq(tour.id, id)).limit(1);
    if (!esistente) throw new NonTrovato('Tour');
    await db.update(tour).set({ eliminatoIl: new Date() }).where(eq(tour.id, id));
  },

  /** Elenco leggero di tutti i tour attivi con almeno una data — solo
   *  per il prerender (anteprime social): non serve al sito, che usa
   *  sempre il dettaglio per slug. */
  async listaPubblica() {
    const righe = await db.select().from(tour).where(isNull(tour.eliminatoIl));
    if (righe.length === 0) return [];
    const conteggi = await db.select({ tourId: tourEventi.tourId, n: sql<number>`count(*)::int` }).from(tourEventi)
      .where(inArray(tourEventi.tourId, righe.map((t) => t.id))).groupBy(tourEventi.tourId);
    const nPerTour = new Map(conteggi.map((c) => [c.tourId, c.n]));
    return righe.filter((t) => (nPerTour.get(t.id) ?? 0) > 0).map((t) => ({ nome: t.nome, slug: t.slug, copertinaUrl: t.copertinaUrl, descrizioneSeo: t.descrizioneSeo, numeroEventi: nPerTour.get(t.id) ?? 0 }));
  },

  /** Per la pagina pubblica /tour/:slug — elenco date a scorrimento. */
  async dettaglioPubblico(slug: string) {
    const [t] = await db.select().from(tour).where(and(eq(tour.slug, slug), isNull(tour.eliminatoIl))).limit(1);
    if (!t) throw new NonTrovato('Tour');
    const membri = await db.select({ e: eventi, ordine: tourEventi.ordine }).from(tourEventi)
      .innerJoin(eventi, eq(eventi.id, tourEventi.eventoId))
      .where(and(eq(tourEventi.tourId, t.id), eq(eventi.visibileSito, true), eq(eventi.bozza, false), eq(eventi.venditeFermate, false), isNull(eventi.eliminatoIl)));
    membri.sort((a, b) => a.ordine - b.ordine || (a.e.data < b.e.data ? -1 : 1));
    const ids = membri.map((m) => m.e.id);
    const [prezzi, vendibili, immagini] = await Promise.all([
      prezziMinimiPerEvento(ids),
      vendibilitaEventi(ids),
      ids.length ? db.select({ eventoId: immaginiEvento.eventoId, url: immaginiEvento.url, ordine: immaginiEvento.ordine }).from(immaginiEvento).where(inArray(immaginiEvento.eventoId, ids)) : Promise.resolve([]),
    ]);
    const primaImmagine = new Map<string, string>();
    for (const i of [...immagini].sort((a, b) => a.ordine - b.ordine)) if (!primaImmagine.has(i.eventoId)) primaImmagine.set(i.eventoId, i.url);
    return {
      nome: t.nome, slug: t.slug, copertinaUrl: t.copertinaUrl, descrizione: t.descrizione,
      eventi: membri.map((m) => ({
        id: m.e.id, slug: m.e.slug, artista: m.e.artista, data: m.e.data, citta: m.e.citta, luogo: m.e.luogo,
        immagineUrl: primaImmagine.get(m.e.id) ?? null, prezzoMinimo: prezzi.get(m.e.id) ?? null, vendibile: vendibili.get(m.e.id) ?? false,
      })),
    };
  },

  /** Gli id degli eventi che appartengono a un Tour ancora attivo — per
   *  toglierli dall'elenco pubblico normale (carosello, sezioni per
   *  categoria): al loro posto compare una card sola per il Tour. */
  async eventiInTour(): Promise<Set<string>> {
    const righe = await db.select({ eventoId: tourEventi.eventoId }).from(tourEventi)
      .innerJoin(tour, eq(tour.id, tourEventi.tourId)).where(isNull(tour.eliminatoIl));
    return new Set(righe.map((r) => r.eventoId));
  },

  /** Le card "virtuali" dei Tour, stessa forma di un Evento normale
   *  (così il carosello e i filtri per categoria non hanno bisogno di
   *  nessuna logica in più) — una per ogni Tour che ha almeno una data
   *  futura e vendibile. Prezzo = il minimo tra tutte le date; genere/
   *  città presi dalla prima data (di solito coincidono, stesso
   *  spettacolo) solo per far funzionare i filtri esistenti. */
  async cardVirtualiTour(soloFuturi: boolean, soloVisibili: boolean) {
    const righeTour = await db.select().from(tour).where(isNull(tour.eliminatoIl));
    if (righeTour.length === 0) return [];

    const membri = await db.select({ tourId: tourEventi.tourId, e: eventi, ordine: tourEventi.ordine }).from(tourEventi)
      .innerJoin(eventi, eq(eventi.id, tourEventi.eventoId))
      .where(and(
        inArray(tourEventi.tourId, righeTour.map((t) => t.id)), isNull(eventi.eliminatoIl),
        soloFuturi ? sql`${eventi.data} >= now()` : undefined,
        soloVisibili ? and(eq(eventi.visibileSito, true), eq(eventi.bozza, false)) : undefined,
      ));
    if (membri.length === 0) return [];

    const idEventiCoinvolti = [...new Set(membri.map((m) => m.e.id))];
    const [prezzi, vendibili] = await Promise.all([
      prezziMinimiPerEvento(idEventiCoinvolti),
      soloVisibili ? vendibilitaEventi(idEventiCoinvolti) : Promise.resolve(new Map<string, boolean>()),
    ]);

    const perTour = new Map<string, typeof membri>();
    for (const m of membri) {
      if (soloVisibili && vendibili.get(m.e.id) === false) continue; // stesso criterio "vendibile" degli eventi normali sul sito
      const lista = perTour.get(m.tourId) ?? [];
      lista.push(m);
      perTour.set(m.tourId, lista);
    }

    const risultato = [];
    for (const t of righeTour) {
      const membriTour = perTour.get(t.id);
      if (!membriTour || membriTour.length === 0) continue; // nessuna data che passa i filtri: il Tour non compare affatto
      membriTour.sort((a, b) => a.e.data < b.e.data ? -1 : 1);
      const primoEvento = membriTour[0].e;
      const prezziTour = membriTour.map((m) => prezzi.get(m.e.id)).filter((p): p is number => p != null);
      risultato.push({
        id: `tour-${t.id}`, // prefisso: mai in collisione con un id evento vero, per sicurezza in ogni lookup a valle
        artista: t.nome, genere: primoEvento.genere, categoria: primoEvento.categoria,
        luogo: `${membriTour.length} date`, citta: primoEvento.citta,
        data: membriTour[0].e.data, // la più vicina — determina dove il Tour compare nell'ordinamento cronologico
        prezzo: prezziTour.length ? Math.min(...prezziTour).toFixed(2) : null,
        inEvidenza: false, ordineEvidenza: 0, accontoEur: null, statoDisponibilita: null,
        visibileSito: true, bozza: false, descrizione: null, descrizioneSeo: null,
        ticketColoreAccento: null, ticketImmagineSfondoUrl: null, layoutBigliettoId: null,
        slug: t.slug, immagini: t.copertinaUrl ? [{ id: `tour-img-${t.id}`, url: t.copertinaUrl, ordine: 0 }] : [],
        tour: true as const, // il frontend lo usa per collegare a /tour/:slug invece che /eventi/:slug
        tragitti: [], servizi: [], allegati: [],
      });
    }
    return risultato;
  },
};
