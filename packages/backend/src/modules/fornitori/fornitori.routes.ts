import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { fornitori } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';

const fornitoreSchema = z.object({
  nome: z.string().min(1),
  partitaIva: z.string().optional(),
  referente: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  indirizzo: z.string().optional(),
  note: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
const aggiornaFornitoreSchema = fornitoreSchema.partial();

async function getById(id: string) {
  const [f] = await db.select().from(fornitori).where(eq(fornitori.id, id)).limit(1);
  if (!f) throw new NonTrovato('Fornitore');
  return f;
}

export const fornitoriService = {
  list: () => db.select().from(fornitori),
  getById,
  create: async (input: z.infer<typeof fornitoreSchema>) => {
    const [nuovo] = await db.insert(fornitori).values(input).returning();
    return nuovo;
  },
  update: async (id: string, input: z.infer<typeof aggiornaFornitoreSchema>) => {
    await getById(id);
    const [aggiornato] = await db.update(fornitori).set(input).where(eq(fornitori.id, id)).returning();
    return aggiornato;
  },
  remove: async (id: string) => {
    await getById(id);
    await db.delete(fornitori).where(eq(fornitori.id, id));
  },
};

export const fornitoriRouter = Router();
fornitoriRouter.use(richiedeAuth, richiedeRuolo('AMMINISTRATORE', 'OPERATORE', 'COLLABORATORE'));

fornitoriRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await fornitoriService.list())));
fornitoriRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => res.json(await fornitoriService.getById(req.params.id))));
fornitoriRouter.post('/', richiedeRuolo('AMMINISTRATORE', 'OPERATORE'), valida(fornitoreSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await fornitoriService.create(req.body))));
fornitoriRouter.put('/:id', richiedeRuolo('AMMINISTRATORE', 'OPERATORE'), valida(aggiornaFornitoreSchema), asyncHandler(async (req: Request, res: Response) => res.json(await fornitoriService.update(req.params.id, req.body))));
fornitoriRouter.delete('/:id', richiedeRuolo('AMMINISTRATORE'), asyncHandler(async (req: Request, res: Response) => { await fornitoriService.remove(req.params.id); res.status(204).send(); }));
