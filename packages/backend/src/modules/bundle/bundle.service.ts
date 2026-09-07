import { and, eq, inArray, isNull, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bundle, bundleEventi, eventi, tragitti, immaginiEvento, whiteLabel } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import type { BundleInput } from './bundle.dto.js';
import { statoBundle, bundleVisibile } from './bundle-stato.js';

function slugDa(testo: string) {
  return testo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bundle';
}
async function slugUnivoco(base: string, idDaEscludere?: string) {
  for (let n = 0; n < 50; n++) {
    const candidato = n === 0 ? base : `${base}-${n + 1}`;
    const [esiste] = await db.select({ id: bundle.id }).from(bundle)
      .where(idDaEscludere ? and(eq(bundle.slug, candidato), sql`${bundle.id} != ${idDaEscludere}`) : eq(bundle.slug, candidato)).limit(1);
    if (!esiste) return candidato;
  }
  return `${base}-${Date.now()}`;
}

/** Vendibilità di ogni evento in una query: futuro, non eliminato, con
 *  almeno un tragitto prezzato/confermato attivo e con posti. */
async function vendibilitaEventi(eventiIds: string[]): Promise<Map<string, boolean>> {
  if (eventiIds.length === 0) return new Map();
  const righe = await db.select({ eventoId: tragitti.eventoId })
    .from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .where(and(inArray(tragitti.eventoId, eventiIds), inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), sql`${tragitti.postiDisponibili} > 0`, isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
  const ok = new Set(righe.map((r) => r.eventoId));
  return new Map(eventiIds.map((id) => [id, ok.has(id)]));
}

async function eventiDelBundle(bundleId: string) {
  const righe = await db.select({ e: eventi, ordine: bundleEventi.ordine }).from(bundleEventi)
    .innerJoin(eventi, eq(eventi.id, bundleEventi.eventoId)).where(eq(bundleEventi.bundleId, bundleId));
  righe.sort((a, b) => a.ordine - b.ordine);
  const ids = righe.map((r) => r.e.id);
  const [vendibili, immagini] = await Promise.all([
    vendibilitaEventi(ids),
    ids.length ? db.select({ eventoId: immaginiEvento.eventoId, url: immaginiEvento.url, ordine: immaginiEvento.ordine }).from(immaginiEvento).where(inArray(immaginiEvento.eventoId, ids)) : Promise.resolve([]),
  ]);
  const primaImmagine = new Map<string, string>();
  for (const i of [...immagini].sort((a, b) => a.ordine - b.ordine)) if (!primaImmagine.has(i.eventoId)) primaImmagine.set(i.eventoId, i.url);
  return righe.map(({ e }) => ({
    id: e.id, slug: e.slug, artista: e.artista, data: e.data, citta: e.citta, luogo: e.luogo, genere: e.genere,
    immagineUrl: primaImmagine.get(e.id) ?? null,
    eliminato: !!e.eliminatoIl,
    vendibile: vendibili.get(e.id) ?? false,
  }));
}

async function getById(id: string) {
  const [b] = await db.select().from(bundle).where(and(eq(bundle.id, id), isNull(bundle.eliminatoIl))).limit(1);
  if (!b) throw new NonTrovato('Bundle');
  return b;
}

/** Un bundle vendibile dal link di un organizzatore deve contenere SOLO
 *  eventi suoi = ogni evento ha una riga white-label attiva per lui. */
async function verificaOrganizzatore(organizzatoreId: string | null | undefined, eventiIds: string[]) {
  if (!organizzatoreId) return;
  const righe = await db.select({ eventoId: whiteLabel.eventoId }).from(whiteLabel)
    .where(and(eq(whiteLabel.organizzatoreId, organizzatoreId), inArray(whiteLabel.eventoId, eventiIds), eq(whiteLabel.attiva, true)));
  const coperti = new Set(righe.map((r) => r.eventoId));
  const mancanti = eventiIds.filter((id) => !coperti.has(id));
  if (mancanti.length) throw new ConflittoDati(`Il bundle può essere venduto dal link di un organizzatore solo se tutti gli eventi sono suoi: ${mancanti.length} evento/i non hanno un link attivo per questo organizzatore.`);
}

async function verificaEventiEsistenti(eventiIds: string[]) {
  const trovati = await db.select({ id: eventi.id }).from(eventi).where(and(inArray(eventi.id, eventiIds), isNull(eventi.eliminatoIl)));
  if (trovati.length !== eventiIds.length) throw new ConflittoDati('Uno degli eventi scelti non esiste più.');
}

function colonneDa(input: BundleInput, slug: string) {
  const { eventiIds, slug: _s, ...resto } = input;
  void eventiIds; void _s;
  return {
    ...resto,
    slug,
    scontoPercentuale: input.scontoPercentuale.toFixed(2),
    minEventi: input.tipo === 'LIBERO' ? input.minEventi ?? 1 : null,
    maxEventi: input.tipo === 'LIBERO' ? input.maxEventi ?? null : null,
    inizioVendita: input.inizioVendita ?? null,
    fineVendita: input.fineVendita ?? null,
    organizzatoreId: input.organizzatoreId ?? null,
  };
}

export const bundleService = {
  // ---- admin
  async list() {
    const righe = await db.select().from(bundle).where(isNull(bundle.eliminatoIl)).orderBy(desc(bundle.creatoIl));
    if (righe.length === 0) return [];
    const conteggi = await db.select({ bundleId: bundleEventi.bundleId, n: sql<number>`count(*)::int` }).from(bundleEventi)
      .where(inArray(bundleEventi.bundleId, righe.map((r) => r.id))).groupBy(bundleEventi.bundleId);
    const nPerBundle = new Map(conteggi.map((c) => [c.bundleId, c.n]));
    return righe.map((b) => ({ ...b, stato: statoBundle(b), numeroEventi: nPerBundle.get(b.id) ?? 0 }));
  },
  async dettaglio(id: string) {
    const b = await getById(id);
    return { ...b, stato: statoBundle(b), eventi: await eventiDelBundle(id) };
  },
  async create(input: BundleInput) {
    await verificaEventiEsistenti(input.eventiIds);
    await verificaOrganizzatore(input.organizzatoreId, input.eventiIds);
    const slug = await slugUnivoco(slugDa(input.slug?.trim() || input.nome));
    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(bundle).values(colonneDa(input, slug)).returning();
      await tx.insert(bundleEventi).values(input.eventiIds.map((eventoId, ordine) => ({ bundleId: nuovo.id, eventoId, ordine })));
      return nuovo;
    });
  },
  async update(id: string, input: BundleInput) {
    const esistente = await getById(id);
    await verificaEventiEsistenti(input.eventiIds);
    await verificaOrganizzatore(input.organizzatoreId, input.eventiIds);
    const slug = input.slug?.trim() && input.slug.trim() !== esistente.slug ? await slugUnivoco(slugDa(input.slug), id) : esistente.slug;
    return db.transaction(async (tx) => {
      const [agg] = await tx.update(bundle).set(colonneDa(input, slug)).where(eq(bundle.id, id)).returning();
      // Gli eventi si sostituiscono per intero (stesso approccio dei
      // tragitti nella scheda evento): la lista nel form È la verità.
      await tx.delete(bundleEventi).where(eq(bundleEventi.bundleId, id));
      await tx.insert(bundleEventi).values(input.eventiIds.map((eventoId, ordine) => ({ bundleId: id, eventoId, ordine })));
      return agg;
    });
  },
  async remove(id: string) {
    await getById(id);
    await db.update(bundle).set({ eliminatoIl: new Date() }).where(eq(bundle.id, id));
  },

  // ---- pubblico
  async listaPubblica() {
    const righe = await db.select().from(bundle).where(and(isNull(bundle.eliminatoIl), eq(bundle.attivo, true))).orderBy(desc(bundle.creatoIl));
    const visibili = righe.filter((b) => bundleVisibile(b));
    return visibili.map((b) => ({
      id: b.id, slug: b.slug, nome: b.nome, descrizione: b.descrizione, copertinaUrl: b.copertinaUrl, tipo: b.tipo,
      scontoPercentuale: b.scontoPercentuale, inizioVendita: b.inizioVendita, fineVendita: b.fineVendita,
      inEvidenzaHome: b.inEvidenzaHome, stato: statoBundle(b),
    }));
  },
  async dettaglioPubblico(slug: string) {
    const [b] = await db.select().from(bundle).where(and(eq(bundle.slug, slug), isNull(bundle.eliminatoIl))).limit(1);
    if (!b || !bundleVisibile(b)) throw new NonTrovato('Bundle');
    const lista = await eventiDelBundle(b.id);
    const eventiVendibili = lista.filter((e) => e.vendibile && !e.eliminato);
    // "Acquistabile" per il cliente: in vendita E la composizione è
    // ancora possibile (fisso: tutti vendibili; libero: almeno il minimo).
    const stato = statoBundle(b);
    const composizionePossibile = b.tipo === 'FISSO' ? eventiVendibili.length === lista.length : eventiVendibili.length >= (b.minEventi ?? 1);
    return {
      id: b.id, slug: b.slug, nome: b.nome, descrizione: b.descrizione, copertinaUrl: b.copertinaUrl, tipo: b.tipo,
      minEventi: b.minEventi, maxEventi: b.maxEventi, minPosti: b.minPosti, maxPosti: b.maxPosti,
      scontoPercentuale: b.scontoPercentuale,
      ammetteOfferte: b.ammetteOfferte, ammetteCredito: b.ammetteCredito, ammettePromoter: b.ammettePromoter, ammetteAcconto: b.ammetteAcconto,
      inizioVendita: b.inizioVendita, fineVendita: b.fineVendita,
      stato, acquistabile: stato === 'IN_VENDITA' && composizionePossibile,
      eventi: lista.filter((e) => !e.eliminato),
    };
  },

  /** Per creaOrdine: il bundle con le sue regole, o errore se non
   *  acquistabile ORA (verifica lato server, non solo nel form). */
  async perAcquisto(bundleId: string) {
    const [b] = await db.select().from(bundle).where(and(eq(bundle.id, bundleId), isNull(bundle.eliminatoIl))).limit(1);
    if (!b) throw new NonTrovato('Bundle');
    const stato = statoBundle(b);
    if (stato !== 'IN_VENDITA') throw new ConflittoDati(stato === 'PROGRAMMATO' ? 'Questo bundle non è ancora in vendita.' : 'Questo bundle non è più in vendita.');
    const righe = await db.select({ eventoId: bundleEventi.eventoId }).from(bundleEventi).where(eq(bundleEventi.bundleId, bundleId));
    return { ...b, eventiIds: righe.map((r) => r.eventoId), scontoPercentuale: Number(b.scontoPercentuale) };
  },
};
