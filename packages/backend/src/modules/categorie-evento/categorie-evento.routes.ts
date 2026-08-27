import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { categorieEvento } from '../../db/schema.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { ConflittoDati, NonTrovato } from '../../shared/errors.js';

const creaCategoriaEventoSchema = z.object({ nome: z.string().min(1) });

export const categorieEventoRouter = Router();

// Lettura pubblica: il sito (pulsanti in alto) e il gestionale la usano senza login.
categorieEventoRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await db.select().from(categorieEvento));
}));

categorieEventoRouter.post(
  '/',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  valida(creaCategoriaEventoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const [esiste] = await db.select().from(categorieEvento).where(eq(categorieEvento.nome, req.body.nome)).limit(1);
    if (esiste) throw new ConflittoDati('Esiste già una categoria con questo nome.');
    const [nuova] = await db.insert(categorieEvento).values({ nome: req.body.nome }).returning();
    res.status(201).json(nuova);
  })
);

categorieEventoRouter.delete(
  '/:id',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  asyncHandler(async (req: Request, res: Response) => {
    const [esiste] = await db.select().from(categorieEvento).where(eq(categorieEvento.id, req.params.id)).limit(1);
    if (!esiste) throw new NonTrovato('Categoria');
    await db.delete(categorieEvento).where(eq(categorieEvento.id, req.params.id));
    res.status(204).send();
  })
);
