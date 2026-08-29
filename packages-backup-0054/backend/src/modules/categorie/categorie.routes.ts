import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { categorie } from '../../db/schema.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { ConflittoDati, NonTrovato } from '../../shared/errors.js';

const creaCategoriaSchema = z.object({ nome: z.string().min(1) });

export const categorieRouter = Router();

// Lettura pubblica: il sito e il menu "Genere" del gestionale la usano senza login.
categorieRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await db.select().from(categorie));
}));

// Scrittura: chi può creare/modificare eventi può gestire anche i generi
// (sono un dato ausiliario degli eventi, non serve un permesso a parte).
categorieRouter.post(
  '/',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  valida(creaCategoriaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const [esiste] = await db.select().from(categorie).where(eq(categorie.nome, req.body.nome)).limit(1);
    if (esiste) throw new ConflittoDati('Esiste già un genere con questo nome.');
    const [nuova] = await db.insert(categorie).values({ nome: req.body.nome }).returning();
    res.status(201).json(nuova);
  })
);

categorieRouter.delete(
  '/:id',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  asyncHandler(async (req: Request, res: Response) => {
    const [esiste] = await db.select().from(categorie).where(eq(categorie.id, req.params.id)).limit(1);
    if (!esiste) throw new NonTrovato('Genere');
    await db.delete(categorie).where(eq(categorie.id, req.params.id));
    res.status(204).send();
  })
);
