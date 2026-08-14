import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { impostazioni } from '../../db/schema.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

/** Chiave usata per la capienza di default di un bus, in "Calcola bus
 *  necessari" nella sezione Partenze. Modificabile dal gestionale. */
export const CHIAVE_POSTI_PER_BUS = 'posti_per_bus';
const DEFAULT_POSTI_PER_BUS = 50;

export async function leggiPostiPerBus(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_POSTI_PER_BUS)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore > 0 ? valore : DEFAULT_POSTI_PER_BUS;
}

export const impostazioniRouter = Router();
impostazioniRouter.use(richiedeAuth);

impostazioniRouter.get('/', richiedePermesso('impostazioni.gestisci'), asyncHandler(async (_req: Request, res: Response) => {
  const tutte = await db.select().from(impostazioni);
  res.json(tutte);
}));

impostazioniRouter.put(
  '/:chiave',
  richiedePermesso('impostazioni.gestisci'),
  valida(z.object({ valore: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    await db.insert(impostazioni).values({ chiave: req.params.chiave, valore: req.body.valore })
      .onConflictDoUpdate({ target: impostazioni.chiave, set: { valore: req.body.valore } });
    res.json({ ok: true });
  })
);
