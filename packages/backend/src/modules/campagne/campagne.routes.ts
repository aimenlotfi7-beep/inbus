import { Router, type Request, type Response } from 'express';
import { eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { campagne, prenotazioni } from '../../db/schema.js';
import { inizioGiornoRoma } from '../../shared/formato.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

/** Un UTM lasciato vuoto si salva come assente (null), non come testo vuoto. */
const campoUtm = z.string().trim().transform((v) => v || null).nullable().optional();

const campagnaSchema = z.object({
  nome: z.string().min(1),
  piattaforma: z.string().optional(),
  tipo: z.string().optional(),
  utmSource: campoUtm,
  utmMedium: campoUtm,
  utmCampaign: campoUtm,
  utmContent: campoUtm,
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
 *  con lo sconto bundle scorporato e le commissioni (promoter e quote
 *  White Label) già sottratte (margine netto).
 *
 *  Stesse regole e stessa fonte di Statistiche → Vendite e canali
 *  (fonteDi, commissioniPer): prima questo report contava anche gli eventi
 *  in bozza o nel cestino e gli acconti per il solo acconto, e dava numeri
 *  diversi per lo stesso periodo. */
async function reportFatturatoPerFonte(dataDa?: Date) {
  const { prenotazioniComeStatistiche } = await import('../statistiche/statistiche.service.js');
  const { commissioniPer } = await import('../statistiche/economia.js');
  const { fonteDi, arrotondaEuro } = await import('../statistiche/calcoli.js');
  const { righe, ctx } = await prenotazioniComeStatistiche(dataDa ? gte(prenotazioni.creataIl, dataDa) : undefined);

  const fontePerRiga = new Map(righe.map((r) => [r.id, fonteDi(r, ctx.campagne, ctx.nomiPromoter, ctx.nomiWhiteLabel, ctx.campagnaDiOfferta)]));
  const commissioni = commissioniPer(righe, (r) => fontePerRiga.get(r.id)!.chiave, ctx);
  const gruppi = new Map<string, { fonte: string; tipo: string; numeroPrenotazioni: number; passeggeri: number; fatturato: number; scontoBundleApplicato: number }>();
  for (const r of righe) {
    const f = fontePerRiga.get(r.id)!;
    const g = gruppi.get(f.chiave) ?? { fonte: f.nome, tipo: f.tipo, numeroPrenotazioni: 0, passeggeri: 0, fatturato: 0, scontoBundleApplicato: 0 };
    g.numeroPrenotazioni += 1;
    g.passeggeri += r.passeggeri;
    g.fatturato += r.totale;
    g.scontoBundleApplicato += Number(r.scontoBundle ?? 0);
    gruppi.set(f.chiave, g);
  }
  return [...gruppi.entries()].map(([chiave, g]) => {
    const fatturato = arrotondaEuro(g.fatturato);
    const commissione = commissioni.get(chiave) ?? 0;
    return { ...g, fatturato, scontoBundleApplicato: arrotondaEuro(g.scontoBundleApplicato), commissione, margineNetto: arrotondaEuro(fatturato - commissione) };
  }).sort((a, b) => b.fatturato - a.fatturato);
}

export const campagneRouter = Router();
campagneRouter.use(richiedeAuth, richiedePermesso('campagne.gestisci'));

campagneRouter.get('/report', asyncHandler(async (req: Request, res: Response) => {
  // "2026-09-13" = dall'inizio di quel giorno a Roma (come le Statistiche).
  const testo = typeof req.query.dataDa === 'string' ? req.query.dataDa : '';
  const dataDa = /^\d{4}-\d{2}-\d{2}$/.test(testo) ? inizioGiornoRoma(new Date(testo)) : testo ? new Date(testo) : undefined;
  res.json(await reportFatturatoPerFonte(dataDa));
}));

campagneRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await campagneService.list())));
campagneRouter.post('/', valida(campagnaSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await campagneService.create(req.body))));
campagneRouter.put('/:id', valida(aggiornaCampagnaSchema), asyncHandler(async (req: Request, res: Response) => res.json(await campagneService.update(req.params.id, req.body))));
campagneRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => { await campagneService.remove(req.params.id); res.status(204).send(); }));
