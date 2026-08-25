import { Router, type Request, type Response } from 'express';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { regoleCommissione } from '../../db/schema.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const commissioniService = {
  async regolaAttiva(organizzatoreId: string) {
    const [r] = await db
      .select()
      .from(regoleCommissione)
      .where(and(eq(regoleCommissione.organizzatoreId, organizzatoreId), isNull(regoleCommissione.validoA)))
      .limit(1);
    return r ?? null;
  },

  async storico(organizzatoreId: string) {
    return db
      .select()
      .from(regoleCommissione)
      .where(eq(regoleCommissione.organizzatoreId, organizzatoreId))
      .orderBy(desc(regoleCommissione.validoDal));
  },

  async imposta(organizzatoreId: string, percentuale: number) {
    return db.transaction(async (tx) => {
      await tx
        .update(regoleCommissione)
        .set({ validoA: new Date() })
        .where(and(eq(regoleCommissione.organizzatoreId, organizzatoreId), isNull(regoleCommissione.validoA)));

      const [nuova] = await tx.insert(regoleCommissione).values({ organizzatoreId, percentuale: String(percentuale) }).returning();
      return nuova;
    });
  },

  async calcolaSnapshot(organizzatoreId: string, totaleVendita: number) {
    const regola = await this.regolaAttiva(organizzatoreId);
    const percentuale = regola ? Number(regola.percentuale) : 0;
    const importo = Math.round(totaleVendita * (percentuale / 100) * 100) / 100;
    return { percentuale, importo };
  },
};

export const commissioniRouter = Router();
commissioniRouter.use(richiedeAuth);

commissioniRouter.get('/organizzatore/:organizzatoreId', richiedePermesso('organizzatori.visualizza'), asyncHandler(async (req: Request, res: Response) => {
  res.json({
    attiva: await commissioniService.regolaAttiva(req.params.organizzatoreId),
    storico: await commissioniService.storico(req.params.organizzatoreId),
  });
}));
commissioniRouter.post(
  '/organizzatore/:organizzatoreId',
  richiedePermesso('organizzatori.gestisci'),
  valida(z.object({ percentuale: z.number().min(0).max(100) })),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json(await commissioniService.imposta(req.params.organizzatoreId, req.body.percentuale));
  }),
);
