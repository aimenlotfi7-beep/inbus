import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { offerteEvento, eventi } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { includeCompleto } from '../eventi/eventi.service.js';
import type { CreaOffertaInput, aggiornaOffertaSchema } from './offerte.dto.js';
import type { z } from 'zod';

export const offerteService = {
  async listByEvento(eventoId: string) {
    return db.select().from(offerteEvento).where(eq(offerteEvento.eventoId, eventoId)).orderBy(desc(offerteEvento.creataIl));
  },

  async create(input: CreaOffertaInput) {
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, input.eventoId)).limit(1);
    if (!evento) throw new NonTrovato('Evento');

    const [esistente] = await db.select().from(offerteEvento).where(eq(offerteEvento.slug, input.slug)).limit(1);
    if (esistente) throw new ConflittoDati(`Esiste già un'offerta con il link "${input.slug}" — scegline un altro.`);

    const [nuova] = await db.insert(offerteEvento).values({
      eventoId: input.eventoId,
      campagnaId: input.campagnaId,
      nome: input.nome,
      slug: input.slug,
      scontoPercentuale: input.scontoPercentuale.toFixed(2),
      attiva: input.attiva,
      validoDal: input.validoDal,
      validoAl: input.validoAl,
      limiteUtilizzi: input.limiteUtilizzi,
    }).returning();
    return nuova;
  },

  async update(id: string, input: z.infer<typeof aggiornaOffertaSchema>) {
    const [o] = await db.select().from(offerteEvento).where(eq(offerteEvento.id, id)).limit(1);
    if (!o) throw new NonTrovato('Offerta');
    const [aggiornata] = await db.update(offerteEvento).set({
      ...(input.campagnaId !== undefined && { campagnaId: input.campagnaId }),
      ...(input.nome !== undefined && { nome: input.nome }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.scontoPercentuale !== undefined && { scontoPercentuale: input.scontoPercentuale.toFixed(2) }),
      ...(input.attiva !== undefined && { attiva: input.attiva }),
      ...(input.validoDal !== undefined && { validoDal: input.validoDal }),
      ...(input.validoAl !== undefined && { validoAl: input.validoAl }),
      ...(input.limiteUtilizzi !== undefined && { limiteUtilizzi: input.limiteUtilizzi }),
    }).where(eq(offerteEvento.id, id)).returning();
    return aggiornata;
  },

  async remove(id: string) {
    const [o] = await db.select().from(offerteEvento).where(eq(offerteEvento.id, id)).limit(1);
    if (!o) throw new NonTrovato('Offerta');
    await db.delete(offerteEvento).where(eq(offerteEvento.id, id));
  },

  /** Recupera un'offerta dal suo slug pubblico, verificando che sia
   *  davvero utilizzabile in questo momento (attiva, nel periodo di
   *  validità, sotto il limite di utilizzi) — usato dalla pagina
   *  pubblica /offerta/:slug. */
  async getBySlugValida(slug: string) {
    const [o] = await db.select().from(offerteEvento).where(eq(offerteEvento.slug, slug)).limit(1);
    if (!o) throw new NonTrovato('Offerta');
    if (!o.attiva) throw new ConflittoDati('Questa offerta non è più attiva.');
    const adesso = new Date();
    if (o.validoDal && adesso < o.validoDal) throw new ConflittoDati('Questa offerta non è ancora disponibile.');
    if (o.validoAl && adesso > o.validoAl) throw new ConflittoDati('Questa offerta è scaduta.');
    if (o.limiteUtilizzi !== null && o.utilizzi >= o.limiteUtilizzi) throw new ConflittoDati('Questa offerta è esaurita.');

    // Query "nuda" prima (senza immagini/tratte/fermate) — la pagina
    // pubblica dell'offerta ne ha bisogno per il prezzo e la galleria,
    // stesso motivo per cui il resto del sito usa sempre questa forma
    // completa quando mostra un evento a un cliente.
    const evento = await db.query.eventi.findFirst({ where: eq(eventi.id, o.eventoId), with: includeCompleto });
    if (!evento) throw new NonTrovato('Evento');
    return { offerta: o, evento };
  },

  /** Stessa verifica di sopra, pensata per essere richiamata al momento
   *  della prenotazione vera (dopo aver deciso che va a buon fine) — poi
   *  incrementa il contatore utilizzi. */
  async verificaEIncrementaUtilizzo(id: string, eventoId: string) {
    const [o] = await db.select().from(offerteEvento).where(eq(offerteEvento.id, id)).limit(1);
    if (!o) throw new NonTrovato('Offerta');
    if (o.eventoId !== eventoId) throw new ConflittoDati('Questa offerta non è valida per questo evento.');
    if (!o.attiva) throw new ConflittoDati('Questa offerta non è più attiva.');
    const adesso = new Date();
    if (o.validoDal && adesso < o.validoDal) throw new ConflittoDati('Questa offerta non è ancora disponibile.');
    if (o.validoAl && adesso > o.validoAl) throw new ConflittoDati('Questa offerta è scaduta.');
    if (o.limiteUtilizzi !== null && o.utilizzi >= o.limiteUtilizzi) throw new ConflittoDati('Questa offerta è esaurita.');

    await db.update(offerteEvento).set({ utilizzi: o.utilizzi + 1 }).where(eq(offerteEvento.id, id));
    return o;
  },
};
