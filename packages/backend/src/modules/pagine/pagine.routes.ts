import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { pagineCms, contenutiSito } from '../../db/schema.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';
import { NonTrovato } from '../../shared/errors.js';

const upsertPaginaSchema = z.object({ titolo: z.string().min(1), contenuto: z.string() });
const upsertContenutoSchema = z.object({ valore: z.string() });

export const pagineService = {
  async list() {
    return db.select().from(pagineCms);
  },
  async getByChiave(chiave: string) {
    const [pagina] = await db.select().from(pagineCms).where(eq(pagineCms.chiave, chiave)).limit(1);
    if (!pagina) throw new NonTrovato('Pagina');
    return pagina;
  },
  async upsert(chiave: string, dati: z.infer<typeof upsertPaginaSchema>) {
    await db
      .insert(pagineCms)
      .values({ chiave, ...dati })
      .onConflictDoUpdate({ target: pagineCms.chiave, set: dati });
    return this.getByChiave(chiave);
  },
  async listContenuti() {
    return db.select().from(contenutiSito);
  },
  async upsertContenuto(chiave: string, valore: string) {
    await db
      .insert(contenutiSito)
      .values({ chiave, valore })
      .onConflictDoUpdate({ target: contenutiSito.chiave, set: { valore } });
  },
};

export const pagineRouter = Router();

// Pubbliche: il sito legge FAQ/Privacy/Cookie/ecc. senza login
pagineRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await pagineService.list())));
pagineRouter.get('/:chiave', asyncHandler(async (req: Request, res: Response) => res.json(await pagineService.getByChiave(req.params.chiave))));

// Scrittura: solo admin/operatore
pagineRouter.put(
  '/:chiave',
  richiedeAuth,
  richiedeRuolo('AMMINISTRATORE', 'OPERATORE'),
  valida(upsertPaginaSchema),
  asyncHandler(async (req: Request, res: Response) => res.json(await pagineService.upsert(req.params.chiave, req.body)))
);

export const contenutiRouter = Router();
contenutiRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await pagineService.listContenuti())));
contenutiRouter.put(
  '/:chiave',
  richiedeAuth,
  richiedeRuolo('AMMINISTRATORE', 'OPERATORE'),
  valida(upsertContenutoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await pagineService.upsertContenuto(req.params.chiave, req.body.valore);
    res.status(204).send();
  })
);
