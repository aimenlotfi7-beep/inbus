import { Router, type Request, type Response } from 'express';
import { eq, gte, lt, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi } from '../../db/schema.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const statisticheService = {
  async generali() {
    const confermate = db.$with('confermate').as(
      db.select().from(prenotazioni).where(eq(prenotazioni.stato, 'CONFERMATA'))
    );
    const [{ incassoTotale, numeroPrenotazioni }] = await db
      .with(confermate)
      .select({
        incassoTotale: sql<number>`coalesce(sum(${confermate.totale}), 0)`,
        numeroPrenotazioni: sql<number>`count(*)`,
      })
      .from(confermate);

    const [{ numeroEventi }] = await db.select({ numeroEventi: sql<number>`count(*)` }).from(eventi);

    return {
      incassoTotale: Number(incassoTotale),
      numeroPrenotazioni: Number(numeroPrenotazioni),
      numeroEventi: Number(numeroEventi),
    };
  },

  /** Incasso per evento (per il grafico "eventi più venduti"). */
  async perEvento() {
    const righe = await db
      .select({
        eventoId: prenotazioni.eventoId,
        artista: eventi.artista,
        incasso: sql<string>`sum(${prenotazioni.totale})`,
        biglietti: sql<string>`sum(${prenotazioni.passeggeri})`,
      })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.eventoId, eventi.artista)
      .orderBy(sql`sum(${prenotazioni.totale}) desc`)
      .limit(10);
    return righe.map((r) => ({ ...r, incasso: Number(r.incasso), biglietti: Number(r.biglietti) }));
  },

  /** Confronto incasso mese corrente vs mese precedente. */
  async confrontoMesi() {
    const ora = new Date();
    const inizioMese = new Date(ora.getFullYear(), ora.getMonth(), 1);
    const inizioMesePrecedente = new Date(ora.getFullYear(), ora.getMonth() - 1, 1);

    async function incassoDa(dataInizio: Date, dataFine: Date) {
      const [{ totale }] = await db
        .select({ totale: sql<number>`coalesce(sum(${prenotazioni.totale}), 0)` })
        .from(prenotazioni)
        .where(and(eq(prenotazioni.stato, 'CONFERMATA'), gte(prenotazioni.creataIl, dataInizio), lt(prenotazioni.creataIl, dataFine)));
      return Number(totale);
    }

    const meseCorrente = await incassoDa(inizioMese, ora);
    const mesePrecedente = await incassoDa(inizioMesePrecedente, inizioMese);
    return { meseCorrente, mesePrecedente };
  },
};

export const statisticheRouter = Router();
statisticheRouter.use(richiedeAuth, richiedePermesso('statistiche.visualizza'));

statisticheRouter.get('/generali', asyncHandler(async (_req: Request, res: Response) => res.json(await statisticheService.generali())));
statisticheRouter.get('/per-evento', asyncHandler(async (_req: Request, res: Response) => res.json(await statisticheService.perEvento())));
statisticheRouter.get('/confronto-mesi', asyncHandler(async (_req: Request, res: Response) => res.json(await statisticheService.confrontoMesi())));
