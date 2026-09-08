import { Router, type Request, type Response } from 'express';
import { eq, and, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { campagne, prenotazioni, promoter } from '../../db/schema.js';
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

/** Fatturato per fonte — la vista che manca all'anagrafica campagne
 *  qui sopra: non "che campagne esistono" ma "quanto ha reso ognuna",
 *  con lo sconto bundle scorporato e la commissione promoter già
 *  sottratta (margine netto), non solo il fatturato lordo.
 *
 *  Una prenotazione si attribuisce a UNA fonte, in quest'ordine:
 *  1. Promoter, se ha un promoterCodice (è la scelta più esplicita:
 *     qualcuno ha usato un codice preciso).
 *  2. Una campagna registrata, se la sua tripla utm coincide.
 *  3. "UTM non registrata" — ha dei parametri utm, ma nessuna riga in
 *     Campagne li descrive (es. un link montato a mano).
 *  4. "Diretto/organico" — nessun dato di provenienza affatto. */
async function reportFatturatoPerFonte(dataDa?: Date) {
  const [righe, tutteCampagne, tuttiPromoter] = await Promise.all([
    db.select({
      utmSource: prenotazioni.utmSource, utmMedium: prenotazioni.utmMedium, utmCampaign: prenotazioni.utmCampaign,
      promoterCodice: prenotazioni.promoterCodice, totale: prenotazioni.totale, scontoBundle: prenotazioni.scontoBundle,
      passeggeri: prenotazioni.passeggeri,
    }).from(prenotazioni).where(and(eq(prenotazioni.stato, 'CONFERMATA'), dataDa ? gte(prenotazioni.creataIl, dataDa) : undefined)),
    db.select().from(campagne),
    db.select().from(promoter),
  ]);

  interface Gruppo { fonte: string; tipo: 'promoter' | 'campagna' | 'utm_non_registrata' | 'diretto'; numeroPrenotazioni: number; passeggeri: number; fatturato: number; scontoBundleApplicato: number; commissionePercentuale?: number; }
  const gruppi = new Map<string, Gruppo>();

  for (const r of righe) {
    let chiave: string; let fonte: string; let tipo: Gruppo['tipo']; let commissionePercentuale: number | undefined;
    const p = r.promoterCodice ? tuttiPromoter.find((x) => x.codice === r.promoterCodice) : undefined;
    if (r.promoterCodice) {
      chiave = `promoter:${r.promoterCodice}`; tipo = 'promoter';
      fonte = p ? `Promoter — ${p.nome}` : `Promoter — codice "${r.promoterCodice}" (non trovato)`;
      commissionePercentuale = p ? Number(p.commissionePercentuale) : undefined;
    } else {
      const c = r.utmSource ? tutteCampagne.find((x) => x.utmSource === r.utmSource && (x.utmMedium ?? null) === (r.utmMedium ?? null) && (x.utmCampaign ?? null) === (r.utmCampaign ?? null)) : undefined;
      if (c) { chiave = `campagna:${c.id}`; tipo = 'campagna'; fonte = c.nome; }
      else if (r.utmSource) { chiave = `utm:${r.utmSource}/${r.utmMedium ?? ''}`; tipo = 'utm_non_registrata'; fonte = `${r.utmSource}${r.utmMedium ? ` / ${r.utmMedium}` : ''} (nessuna campagna registrata)`; }
      else { chiave = 'diretto'; tipo = 'diretto'; fonte = 'Diretto / organico (nessun dato di provenienza)'; }
    }
    const g = gruppi.get(chiave) ?? { fonte, tipo, numeroPrenotazioni: 0, passeggeri: 0, fatturato: 0, scontoBundleApplicato: 0, commissionePercentuale };
    g.numeroPrenotazioni += 1;
    g.passeggeri += r.passeggeri;
    g.fatturato += Number(r.totale);
    g.scontoBundleApplicato += Number(r.scontoBundle ?? 0);
    gruppi.set(chiave, g);
  }

  return [...gruppi.values()]
    .map((g) => {
      const commissione = g.commissionePercentuale != null ? Math.round(g.fatturato * g.commissionePercentuale) / 100 : 0;
      return { ...g, commissione, margineNetto: g.fatturato - commissione };
    })
    .sort((a, b) => b.fatturato - a.fatturato);
}

export const campagneRouter = Router();
campagneRouter.use(richiedeAuth, richiedePermesso('campagne.gestisci'));

campagneRouter.get('/report', asyncHandler(async (req: Request, res: Response) => {
  const dataDa = typeof req.query.dataDa === 'string' && req.query.dataDa ? new Date(req.query.dataDa) : undefined;
  res.json(await reportFatturatoPerFonte(dataDa));
}));

campagneRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await campagneService.list())));
campagneRouter.post('/', valida(campagnaSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await campagneService.create(req.body))));
campagneRouter.put('/:id', valida(aggiornaCampagnaSchema), asyncHandler(async (req: Request, res: Response) => res.json(await campagneService.update(req.params.id, req.body))));
campagneRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => { await campagneService.remove(req.params.id); res.status(204).send(); }));
