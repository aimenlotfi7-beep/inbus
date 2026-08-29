import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { tragitti, fermateTragitto } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

// I tragitti sono ora solo template di fermate+prezzo, riutilizzabili su
// qualunque evento — l'orario non c'è più qui: si calcola sulla singola
// tratta dell'evento, dove si sa qual è la vera destinazione.
const fermataTragittoSchema = z.object({
  citta: z.string().min(1),
  indirizzo: z.string().min(1),
  // Tollerante a `null` per compatibilità con vecchie fermate salvate
  // prima di questo cambiamento — lo tratta come assente.
  prezzo: z.number().positive().nullable().optional().transform((v) => v ?? undefined),
});
const tragittoSchema = z.object({
  nome: z.string().min(1),
  fermate: z.array(fermataTragittoSchema).default([]),
}).refine(
  (t) => t.fermate.every((f) => f.prezzo !== undefined),
  { message: 'Ogni fermata deve avere un prezzo.', path: ['fermate'] }
);
const aggiornaTragittoSchema = z.object({
  nome: z.string().min(1).optional(),
  fermate: z.array(fermataTragittoSchema).optional(),
}).refine(
  (t) => !t.fermate || t.fermate.every((f) => f.prezzo !== undefined),
  { message: 'Ogni fermata deve avere un prezzo.', path: ['fermate'] }
);

async function getById(id: string) {
  const tragitto = await db.query.tragitti.findFirst({
    where: eq(tragitti.id, id),
    with: { fermate: true },
  });
  if (!tragitto) throw new NonTrovato('Tragitto');
  return tragitto;
}

export const tragittiService = {
  list: () => db.query.tragitti.findMany({ with: { fermate: true } }),
  getById,

  async create(input: z.infer<typeof tragittoSchema>) {
    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(tragitti).values({ nome: input.nome }).returning();
      if (input.fermate.length) {
        await tx.insert(fermateTragitto).values(
          input.fermate.map((f, ordine) => ({
            tragittoId: nuovo.id, ordine, citta: f.citta, indirizzo: f.indirizzo,
            prezzo: f.prezzo?.toFixed(2),
          }))
        );
      }
      return nuovo.id;
    });
  },

  async update(id: string, input: z.infer<typeof aggiornaTragittoSchema>) {
    await getById(id);
    return db.transaction(async (tx) => {
      if (input.nome !== undefined) {
        await tx.update(tragitti).set({ nome: input.nome }).where(eq(tragitti.id, id));
      }
      if (input.fermate) {
        await tx.delete(fermateTragitto).where(eq(fermateTragitto.tragittoId, id));
        if (input.fermate.length) {
          await tx.insert(fermateTragitto).values(
            input.fermate.map((f, ordine) => ({
              tragittoId: id, ordine, citta: f.citta, indirizzo: f.indirizzo,
              prezzo: f.prezzo?.toFixed(2),
            }))
          );
        }
      }
      return id;
    });
  },

  async remove(id: string) {
    await getById(id);
    await db.delete(tragitti).where(eq(tragitti.id, id)); // cascade sulle fermate
  },
};

export const tragittiRouter = Router();
tragittiRouter.use(richiedeAuth);

tragittiRouter.get('/', richiedePermesso('tragitti.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await tragittiService.list())));
tragittiRouter.get('/:id', richiedePermesso('tragitti.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await tragittiService.getById(req.params.id))));
tragittiRouter.post('/', richiedePermesso('tragitti.gestisci'), valida(tragittoSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await tragittiService.create(req.body);
  res.status(201).json(await tragittiService.getById(id));
}));
tragittiRouter.put('/:id', richiedePermesso('tragitti.gestisci'), valida(aggiornaTragittoSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await tragittiService.update(req.params.id, req.body);
  res.json(await tragittiService.getById(id));
}));
tragittiRouter.delete('/:id', richiedePermesso('tragitti.gestisci'), asyncHandler(async (req: Request, res: Response) => { await tragittiService.remove(req.params.id); res.status(204).send(); }));
