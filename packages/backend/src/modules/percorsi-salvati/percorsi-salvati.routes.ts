import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { percorsiSalvati, fermatePercorsoSalvato } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

const fermataPercorsoSchema = z.object({
  fermataAnagraficaId: z.string().nullable().optional(),
  citta: z.string().min(1),
  // Facoltativo SOLO per la fermata "Partenza" — quella si scrive in
  // Eventi quando il percorso viene applicato (dipende dall'evento
  // specifico). Le fermate intermedie (PASSAGGIO) lo richiedono
  // comunque — controllato sotto, nel refine, dato che qui Zod non sa
  // ancora se questa riga è la Partenza o una intermedia.
  indirizzo: z.string().min(1).nullable().optional(),
  prezzo: z.number().positive().nullable().optional().transform((v) => v ?? undefined),
  // Decisi qui (sul percorso, il modello riutilizzabile) e non più in
  // Eventi — se lo stesso percorso si applica a più eventi, ha senso
  // stabilire una volta sola quale fermata è "Partenza".
  tipo: z.enum(['PARTENZA', 'PASSAGGIO']).default('PASSAGGIO'),
  sogliaMinima: z.number().int().positive().nullable().optional(),
});
const percorsoSalvatoSchema = z.object({
  nome: z.string().min(1),
  // Solo il nome della città — l'indirizzo vero (la venue) si scrive
  // sempre in Eventi, come già per arrivoIndirizzo sui tragitti veri:
  // lo stesso percorso può portare a venue diverse nella stessa città.
  arrivoCitta: z.string().min(1).nullable().optional(),
  fermate: z.array(fermataPercorsoSchema).default([]),
}).refine(
  (t) => t.fermate.every((f) => f.prezzo !== undefined),
  { message: 'Ogni fermata deve avere un prezzo.', path: ['fermate'] }
).refine(
  // La PRIMA fermata dell'elenco (posizione, non il campo "tipo" — che
  // significa tutt'altro: se quella fermata ha una soglia minima di
  // partecipanti, vedi sopra) è il punto di partenza geografico, può
  // restare senza indirizzo. Tutte le altre lo richiedono comunque.
  (t) => t.fermate.every((f, idx) => idx === 0 || f.indirizzo?.trim()),
  { message: 'Ogni fermata intermedia deve avere un indirizzo — solo la prima (la Partenza) può esserne senza.', path: ['fermate'] }
);
const aggiornaPercorsoSalvatoSchema = z.object({
  nome: z.string().min(1).optional(),
  arrivoCitta: z.string().min(1).nullable().optional(),
  fermate: z.array(fermataPercorsoSchema).optional(),
}).refine(
  (t) => !t.fermate || t.fermate.every((f) => f.prezzo !== undefined),
  { message: 'Ogni fermata deve avere un prezzo.', path: ['fermate'] }
).refine(
  (t) => !t.fermate || t.fermate.every((f, idx) => idx === 0 || f.indirizzo?.trim()),
  { message: 'Ogni fermata intermedia deve avere un indirizzo — solo la prima (la Partenza) può esserne senza.', path: ['fermate'] }
);

async function getById(id: string) {
  const percorso = await db.query.percorsiSalvati.findFirst({
    where: eq(percorsiSalvati.id, id),
    with: { fermate: true },
  });
  if (!percorso) throw new NonTrovato('Percorso salvato');
  return percorso;
}

export const percorsiSalvatiService = {
  list: () => db.query.percorsiSalvati.findMany({ with: { fermate: true } }),
  getById,

  async create(input: z.infer<typeof percorsoSalvatoSchema>) {
    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(percorsiSalvati).values({ nome: input.nome, arrivoCitta: input.arrivoCitta }).returning();
      if (input.fermate.length) {
        await tx.insert(fermatePercorsoSalvato).values(
          input.fermate.map((f, ordine) => ({
            percorsoSalvatoId: nuovo.id, ordine, fermataAnagraficaId: f.fermataAnagraficaId, citta: f.citta, indirizzo: f.indirizzo,
            prezzo: f.prezzo?.toFixed(2), tipo: f.tipo, sogliaMinima: f.sogliaMinima,
          }))
        );
      }
      return nuovo.id;
    });
  },

  async update(id: string, input: z.infer<typeof aggiornaPercorsoSalvatoSchema>) {
    await getById(id);
    return db.transaction(async (tx) => {
      if (input.nome !== undefined) {
        await tx.update(percorsiSalvati).set({ nome: input.nome }).where(eq(percorsiSalvati.id, id));
      }
      if (input.arrivoCitta !== undefined) {
        await tx.update(percorsiSalvati).set({ arrivoCitta: input.arrivoCitta }).where(eq(percorsiSalvati.id, id));
      }
      if (input.fermate) {
        await tx.delete(fermatePercorsoSalvato).where(eq(fermatePercorsoSalvato.percorsoSalvatoId, id));
        if (input.fermate.length) {
          await tx.insert(fermatePercorsoSalvato).values(
            input.fermate.map((f, ordine) => ({
              percorsoSalvatoId: id, ordine, fermataAnagraficaId: f.fermataAnagraficaId, citta: f.citta, indirizzo: f.indirizzo,
              prezzo: f.prezzo?.toFixed(2), tipo: f.tipo, sogliaMinima: f.sogliaMinima,
            }))
          );
        }
      }
      return id;
    });
  },

  async remove(id: string) {
    await getById(id);
    await db.delete(percorsiSalvati).where(eq(percorsiSalvati.id, id));
  },
};

export const percorsiSalvatiRouter = Router();
percorsiSalvatiRouter.use(richiedeAuth);

percorsiSalvatiRouter.get('/', richiedePermesso('tragitti.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await percorsiSalvatiService.list())));
percorsiSalvatiRouter.get('/:id', richiedePermesso('tragitti.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await percorsiSalvatiService.getById(req.params.id))));
percorsiSalvatiRouter.post('/', richiedePermesso('tragitti.gestisci'), valida(percorsoSalvatoSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await percorsiSalvatiService.create(req.body);
  res.status(201).json(await percorsiSalvatiService.getById(id));
}));
percorsiSalvatiRouter.put('/:id', richiedePermesso('tragitti.gestisci'), valida(aggiornaPercorsoSalvatoSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await percorsiSalvatiService.update(req.params.id, req.body);
  res.json(await percorsiSalvatiService.getById(id));
}));
percorsiSalvatiRouter.delete('/:id', richiedePermesso('tragitti.gestisci'), asyncHandler(async (req: Request, res: Response) => { await percorsiSalvatiService.remove(req.params.id); res.status(204).send(); }));
