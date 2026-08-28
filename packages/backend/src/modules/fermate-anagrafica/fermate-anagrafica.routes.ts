import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { fermateAnagrafica, fermate } from '../../db/schema.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';

const fermataAnagraficaSchema = z.object({
  nome: z.string().min(1),
  citta: z.string().min(1),
  indirizzo: z.string().min(1),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
});

export const fermateAnagraficaRouter = Router();

fermateAnagraficaRouter.get(
  '/',
  richiedeAuth,
  richiedePermesso('tragitti.visualizza'),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await db.select().from(fermateAnagrafica).orderBy(fermateAnagrafica.citta, fermateAnagrafica.nome));
  })
);

fermateAnagraficaRouter.post(
  '/',
  richiedeAuth,
  richiedePermesso('tragitti.gestisci'),
  valida(fermataAnagraficaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const [nuova] = await db.insert(fermateAnagrafica).values(req.body).returning();
    res.status(201).json(nuova);
  })
);

fermateAnagraficaRouter.put(
  '/:id',
  richiedeAuth,
  richiedePermesso('tragitti.gestisci'),
  valida(fermataAnagraficaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const [esiste] = await db.select().from(fermateAnagrafica).where(eq(fermateAnagrafica.id, req.params.id)).limit(1);
    if (!esiste) throw new NonTrovato('Fermata');
    // Modificare qui NON tocca mai le fermate già usate nei tragitti —
    // quelle restano con i loro valori scritti al momento della scelta
    // (vedi tragitti.service.ts), esattamente il punto centrale di
    // questa separazione: cambiare l'indirizzo del luogo fisico non
    // deve mai alterare un viaggio già configurato nel passato.
    const [aggiornata] = await db.update(fermateAnagrafica).set(req.body).where(eq(fermateAnagrafica.id, req.params.id)).returning();
    res.json(aggiornata);
  })
);

fermateAnagraficaRouter.delete(
  '/:id',
  richiedeAuth,
  richiedePermesso('tragitti.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    const [esiste] = await db.select().from(fermateAnagrafica).where(eq(fermateAnagrafica.id, req.params.id)).limit(1);
    if (!esiste) throw new NonTrovato('Fermata');
    const [inUso] = await db.select({ id: fermate.id }).from(fermate).where(eq(fermate.fermataAnagraficaId, req.params.id)).limit(1);
    if (inUso) throw new ConflittoDati('Questa fermata è usata in almeno un tragitto — non puoi eliminarla (i tragitti che la usano restano comunque intatti anche se la lasci).');
    await db.delete(fermateAnagrafica).where(eq(fermateAnagrafica.id, req.params.id));
    res.status(204).send();
  })
);
