import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { tourLeader } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

const candidaturaSchema = z.object({
  nome: z.string().min(1),
  cognome: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().optional(),
  dataNascita: z.coerce.date().optional(),
  citta: z.string().optional(),
  lingue: z.string().optional(),
  disponibilita: z.string().optional(),
  esperienza: z.string().optional(),
  note: z.string().optional(),
  eventoRiferimento: z.string().optional(),
});
const aggiornaSchema = candidaturaSchema.partial().extend({
  stato: z.enum(['CANDIDATO', 'ATTIVO', 'ARCHIVIATO']).optional(),
});

async function getById(id: string) {
  const [t] = await db.select().from(tourLeader).where(eq(tourLeader.id, id)).limit(1);
  if (!t) throw new NonTrovato('Tour leader');
  return t;
}

export const tourLeaderService = {
  list: () => db.select().from(tourLeader),
  getById,
  candidati: async (input: z.infer<typeof candidaturaSchema>) => {
    const [nuovo] = await db.insert(tourLeader).values({ ...input, stato: 'CANDIDATO' }).returning();
    return nuovo;
  },
  update: async (id: string, input: z.infer<typeof aggiornaSchema>) => {
    await getById(id);
    const [aggiornato] = await db.update(tourLeader).set(input).where(eq(tourLeader.id, id)).returning();
    return aggiornato;
  },
  remove: async (id: string) => {
    await getById(id);
    await db.delete(tourLeader).where(eq(tourLeader.id, id));
  },
};

export const tourLeaderRouter = Router();

// Pubblico: il form di autocandidatura (nessun login richiesto)
tourLeaderRouter.post('/candidatura', valida(candidaturaSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await tourLeaderService.candidati(req.body));
}));

// Amministrazione
tourLeaderRouter.use(richiedeAuth);
tourLeaderRouter.get('/', richiedePermesso('tourleader.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await tourLeaderService.list())));
tourLeaderRouter.get('/:id', richiedePermesso('tourleader.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await tourLeaderService.getById(req.params.id))));
tourLeaderRouter.put('/:id', richiedePermesso('tourleader.gestisci'), valida(aggiornaSchema), asyncHandler(async (req: Request, res: Response) => res.json(await tourLeaderService.update(req.params.id, req.body))));
tourLeaderRouter.delete('/:id', richiedePermesso('tourleader.gestisci'), asyncHandler(async (req: Request, res: Response) => { await tourLeaderService.remove(req.params.id); res.status(204).send(); }));
