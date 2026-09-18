import { Router, type Request, type Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { amministratori, eventi, eventoResponsabile, ruoli } from '../../db/schema.js';
import { ConflittoDati, NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { giorniTra, oggiRoma } from '../statistiche/periodo.js';
import { giornoARoma } from '../../shared/formato.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { TIPI_COMPENSO, descriviRegola } from './compenso.js';

/**
 * Responsabili operativi degli eventi e loro compensi (proprietario,
 * settembre 2026). Un evento ha al massimo un responsabile (un'utenza del
 * gestionale); il compenso si sceglie evento per evento (compenso.ts) e si
 * calcola con gli stessi numeri delle Statistiche, dove è una spesa
 * dell'evento. Assegnare e pagare: permesso collaboratori.gestisci. Ognuno
 * vede i propri compensi in "Il mio compenso" (GET /miei), senza incassi,
 * costi e margini dell'evento.
 */

interface Assegnazione {
  eventoId: string;
  artista: string;
  citta: string;
  data: Date;
  amministratoreId: string;
  responsabile: string;
  compensoTipo: (typeof TIPI_COMPENSO)[number];
  compensoValore: string;
  pagatoIl: Date | null;
  importoPagato: string | null;
}

async function leggiAssegnazioni(filtro?: { amministratoreId?: string; eventoId?: string }): Promise<Assegnazione[]> {
  return db.select({
    eventoId: eventoResponsabile.eventoId,
    artista: eventi.artista,
    citta: eventi.citta,
    data: eventi.data,
    amministratoreId: eventoResponsabile.amministratoreId,
    responsabile: amministratori.nome,
    compensoTipo: eventoResponsabile.compensoTipo,
    compensoValore: eventoResponsabile.compensoValore,
    pagatoIl: eventoResponsabile.pagatoIl,
    importoPagato: eventoResponsabile.importoPagato,
  }).from(eventoResponsabile)
    .innerJoin(eventi, eq(eventi.id, eventoResponsabile.eventoId))
    .innerJoin(amministratori, eq(amministratori.id, eventoResponsabile.amministratoreId))
    .where(and(
      filtro?.amministratoreId ? eq(eventoResponsabile.amministratoreId, filtro.amministratoreId) : undefined,
      filtro?.eventoId ? eq(eventoResponsabile.eventoId, filtro.eventoId) : undefined,
    ))
    .orderBy(asc(eventi.data));
}

/** Le assegnazioni con il compenso calcolato: previsto e a oggi (a evento
 *  concluso è quello definitivo, su quanto è stato pagato davvero). */
async function conCompenso(righe: Assegnazione[]) {
  if (righe.length === 0) return [];
  const { caricaDatiEventi } = await import('../statistiche/statistiche.service.js');
  const { economiaEventi } = await import('../statistiche/economia.js');
  const ids = righe.map((r) => r.eventoId);
  const economia = economiaEventi(ids, await caricaDatiEventi(ids));
  const oggi = oggiRoma();
  return righe.map((r) => {
    const eco = economia.get(r.eventoId);
    const regola = { tipo: r.compensoTipo, valore: Number(r.compensoValore) };
    return {
      eventoId: r.eventoId,
      artista: r.artista,
      citta: r.citta,
      data: r.data.toISOString(),
      concluso: giorniTra(oggi, giornoARoma(r.data)) < 0,
      amministratoreId: r.amministratoreId,
      responsabile: r.responsabile,
      compensoTipo: regola.tipo,
      compensoValore: regola.valore,
      regola: descriviRegola(regola),
      previsto: eco?.compenso ?? 0,
      aOggi: eco?.compensoAOggi ?? 0,
      pagatoIl: r.pagatoIl?.toISOString() ?? null,
      importoPagato: r.importoPagato === null ? null : Number(r.importoPagato),
    };
  });
}

const assegnaSchema = z.object({
  amministratoreId: z.string().min(1),
  compensoTipo: z.enum(TIPI_COMPENSO),
  compensoValore: z.number().min(0).max(1_000_000),
}).refine((v) => v.compensoTipo === 'FISSO' || v.compensoValore <= 100, {
  message: 'Una percentuale va da 0 a 100.', path: ['compensoValore'],
});

export const collaboratoriRouter = Router();
collaboratoriRouter.use(richiedeAuth);

/** I propri compensi, per chiunque sia responsabile di almeno un evento. */
collaboratoriRouter.get('/miei', asyncHandler(async (req: Request, res: Response) => {
  const compensi = await conCompenso(await leggiAssegnazioni({ amministratoreId: req.admin!.sub }));
  // Solo quello che serve a lui: niente nome del responsabile (è lui) né id interni.
  res.json(compensi.map(({ amministratoreId: _a, responsabile: _r, ...resto }) => resto));
}));

/** Tutte le assegnazioni, per chi gestisce i compensi. */
collaboratoriRouter.get('/compensi', richiedePermesso('collaboratori.gestisci'), asyncHandler(async (_req: Request, res: Response) => {
  res.json(await conCompenso(await leggiAssegnazioni()));
}));

/** Le utenze che possono diventare responsabili: tutte le attive tranne i proprietari. */
collaboratoriRouter.get('/responsabili', richiedePermesso('collaboratori.gestisci'), asyncHandler(async (_req: Request, res: Response) => {
  res.json(await db.select({ id: amministratori.id, nome: amministratori.nome, email: amministratori.email, soloEventiAssegnati: amministratori.soloEventiAssegnati })
    .from(amministratori).innerJoin(ruoli, eq(ruoli.id, amministratori.ruoloId))
    .where(and(eq(amministratori.attivo, true), eq(ruoli.owner, false)))
    .orderBy(asc(amministratori.nome)));
}));

collaboratoriRouter.get('/evento/:eventoId', richiedePermesso('collaboratori.gestisci'), asyncHandler(async (req: Request, res: Response) => {
  const [voce] = await conCompenso(await leggiAssegnazioni({ eventoId: req.params.eventoId }));
  res.json(voce ?? null);
}));

/** Assegna (o cambia) il responsabile e il suo compenso. Cambiare il
 *  compenso dopo averlo segnato pagato toglie il segno: va ripagato. */
collaboratoriRouter.put('/evento/:eventoId', richiedePermesso('collaboratori.gestisci'), valida(assegnaSchema), asyncHandler(async (req: Request, res: Response) => {
  const { eventoId } = req.params;
  const [evento] = await db.select({ id: eventi.id }).from(eventi).where(eq(eventi.id, eventoId)).limit(1);
  if (!evento) throw new NonTrovato('Evento');
  const [admin] = await db.select({ attivo: amministratori.attivo, owner: ruoli.owner }).from(amministratori)
    .innerJoin(ruoli, eq(ruoli.id, amministratori.ruoloId)).where(eq(amministratori.id, req.body.amministratoreId)).limit(1);
  if (!admin || !admin.attivo) throw new ConflittoDati('Questa utenza non esiste o è disattivata.');
  if (admin.owner) throw new ConflittoDati('Il proprietario non può essere responsabile di un evento con un compenso.');
  const valori = {
    amministratoreId: req.body.amministratoreId,
    compensoTipo: req.body.compensoTipo,
    compensoValore: req.body.compensoValore.toFixed(2),
  };
  await db.insert(eventoResponsabile).values({ eventoId, ...valori })
    .onConflictDoUpdate({ target: eventoResponsabile.eventoId, set: { ...valori, pagatoIl: null, importoPagato: null } });
  const [voce] = await conCompenso(await leggiAssegnazioni({ eventoId }));
  res.json(voce);
}));

collaboratoriRouter.delete('/evento/:eventoId', richiedePermesso('collaboratori.gestisci'), asyncHandler(async (req: Request, res: Response) => {
  await db.delete(eventoResponsabile).where(eq(eventoResponsabile.eventoId, req.params.eventoId));
  res.status(204).send();
}));

/** Segna pagato il compenso: di serie la cifra a oggi (a evento concluso, quella definitiva). */
collaboratoriRouter.post('/evento/:eventoId/pagato', richiedePermesso('collaboratori.gestisci'), valida(z.object({ importo: z.number().min(0).optional() })), asyncHandler(async (req: Request, res: Response) => {
  const [voce] = await conCompenso(await leggiAssegnazioni({ eventoId: req.params.eventoId }));
  if (!voce) throw new NonTrovato('Responsabile dell\'evento');
  const importo = req.body.importo ?? voce.aOggi;
  await db.update(eventoResponsabile).set({ pagatoIl: new Date(), importoPagato: importo.toFixed(2) })
    .where(eq(eventoResponsabile.eventoId, req.params.eventoId));
  const [aggiornata] = await conCompenso(await leggiAssegnazioni({ eventoId: req.params.eventoId }));
  res.json(aggiornata);
}));

collaboratoriRouter.delete('/evento/:eventoId/pagato', richiedePermesso('collaboratori.gestisci'), asyncHandler(async (req: Request, res: Response) => {
  await db.update(eventoResponsabile).set({ pagatoIl: null, importoPagato: null }).where(eq(eventoResponsabile.eventoId, req.params.eventoId));
  const [aggiornata] = await conCompenso(await leggiAssegnazioni({ eventoId: req.params.eventoId }));
  res.json(aggiornata ?? null);
}));

/** Quanti eventi ha assegnati un'utenza (per il menu "Il mio compenso" e
 *  per non eliminare un'utenza che ha compensi da registrare). */
export async function eventiAssegnatiA(amministratoreId: string): Promise<number> {
  const righe = await db.select({ eventoId: eventoResponsabile.eventoId }).from(eventoResponsabile)
    .where(eq(eventoResponsabile.amministratoreId, amministratoreId));
  return righe.length;
}
