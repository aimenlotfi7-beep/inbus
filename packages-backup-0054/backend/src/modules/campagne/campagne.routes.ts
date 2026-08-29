import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { campagne } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

const campagnaSchema = z.object({
  nome: z.string().min(1),
  piattaforma: z.string().optional(),
  tipo: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  attiva: z.boolean().default(true),
});
const aggiornaCampagnaSchema = campagnaSchema.partial();

export const campagneService = {
  list: () => db.select().from(campagne),
  async create(input: z.infer<typeof campagnaSchema>) {
    const [nuova] = await db.insert(campagne).values(input).returning();
    return nuova;
  },
  async update(id: string, input: z.infer<typeof aggiornaCampagnaSchema>) {
    const [c] = await db.select().from(campagne).where(eq(campagne.id, id)).limit(1);
    if (!c) throw new NonTrovato('Campagna');
    const [aggiornata] = await db.update(campagne).set(input).where(eq(campagne.id, id)).returning();
    return aggiornata;
  },
  async remove(id: string) {
    const [c] = await db.select().from(campagne).where(eq(campagne.id, id)).limit(1);
    if (!c) throw new NonTrovato('Campagna');
    await db.delete(campagne).where(eq(campagne.id, id));
  },
};

export const campagneRouter = Router();
campagneRouter.use(richiedeAuth, richiedePermesso('campagne.gestisci'));

campagneRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await campagneService.list())));
campagneRouter.post('/', valida(campagnaSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await campagneService.create(req.body))));
campagneRouter.put('/:id', valida(aggiornaCampagnaSchema), asyncHandler(async (req: Request, res: Response) => res.json(await campagneService.update(req.params.id, req.body))));
campagneRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => { await campagneService.remove(req.params.id); res.status(204).send(); }));
