import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { promoter, promoterEventi, prenotazioni, eventi } from '../../db/schema.js';
import { NonTrovato, NonAutorizzato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { limiteAutenticazione } from '../../shared/rateLimit.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { env } from '../../config/env.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';

const ORE_VALIDITA_TOKEN_RESET = 2;
function generaTokenReset() {
  return crypto.randomBytes(24).toString('hex');
}

function generaCodice(nome: string) {
  const base = nome.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'PROMO';
  return `${base}${Math.floor(Math.random() * 900 + 100)}`;
}

const creaPromoterSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().optional(),
  password: z.string().min(6),
  commissionePercentuale: z.number().min(0).max(100).default(10),
  note: z.string().optional(),
  eventiAbilitati: z.array(z.string()).default([]),
});
const aggiornaPromoterSchema = creaPromoterSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
});
const loginPromoterSchema = z.object({ email: z.string().email(), password: z.string() });

async function getById(id: string) {
  const [p] = await db.select().from(promoter).where(eq(promoter.id, id)).limit(1);
  if (!p) throw new NonTrovato('Promoter');
  const eventiAbilitati = await db.select().from(promoterEventi).where(eq(promoterEventi.promoterId, id));
  return { ...p, eventiAbilitati: eventiAbilitati.map((e) => e.eventoId) };
}

export const promoterService = {
  list: () => db.select().from(promoter),
  getById,

  async create(input: z.infer<typeof creaPromoterSchema>) {
    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(promoter).values({
        nome: input.nome, email: input.email.toLowerCase(), telefono: input.telefono,
        passwordHash: await bcrypt.hash(input.password, 10),
        codice: generaCodice(input.nome),
        commissionePercentuale: input.commissionePercentuale.toFixed(2),
        note: input.note,
      }).returning();
      // Di default un nuovo promoter è abilitato a TUTTI gli eventi
      // esistenti al momento — decide poi lui stesso, dalla sua area,
      // se disattivarne qualcuno o abilitarsi anche a quelli nuovi che
      // arriveranno dopo. Solo se l'amministratore ha scelto un elenco
      // specifico in fase di censimento, si parte da quello invece.
      const eventiDaAbilitare = input.eventiAbilitati.length > 0
        ? input.eventiAbilitati
        : (await tx.select({ id: eventi.id }).from(eventi)).map((e) => e.id);
      if (eventiDaAbilitare.length) {
        await tx.insert(promoterEventi).values(eventiDaAbilitare.map((eventoId) => ({ promoterId: nuovo.id, eventoId })));
      }
      return nuovo.id;
    });
  },

  async update(id: string, input: z.infer<typeof aggiornaPromoterSchema>) {
    await getById(id);
    return db.transaction(async (tx) => {
      await tx.update(promoter).set({
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.email !== undefined && { email: input.email.toLowerCase() }),
        ...(input.telefono !== undefined && { telefono: input.telefono }),
        ...(input.password && { passwordHash: await bcrypt.hash(input.password, 10) }),
        ...(input.commissionePercentuale !== undefined && { commissionePercentuale: input.commissionePercentuale.toFixed(2) }),
        ...(input.note !== undefined && { note: input.note }),
      }).where(eq(promoter.id, id));
      if (input.eventiAbilitati) {
        await tx.delete(promoterEventi).where(eq(promoterEventi.promoterId, id));
        if (input.eventiAbilitati.length) {
          await tx.insert(promoterEventi).values(input.eventiAbilitati.map((eventoId) => ({ promoterId: id, eventoId })));
        }
      }
      return id;
    });
  },

  async remove(id: string) {
    await getById(id);
    await db.delete(promoter).where(eq(promoter.id, id));
  },

  async login(input: z.infer<typeof loginPromoterSchema>) {
    const [p] = await db.select().from(promoter).where(eq(promoter.email, input.email.toLowerCase())).limit(1);
    if (!p || !(await bcrypt.compare(input.password, p.passwordHash))) throw new NonAutorizzato('Email o password non corrette');
    const token = jwt.sign({ sub: p.id, tipo: 'promoter' }, env.JWT_SECRET, { expiresIn: '12h' });
    return { token, promoter: { id: p.id, nome: p.nome, codice: p.codice } };
  },

  async richiediResetPassword(email: string) {
    const [p] = await db.select().from(promoter).where(eq(promoter.email, email.toLowerCase())).limit(1);
    if (!p) return; // silenzioso apposta

    const token = generaTokenReset();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_RESET * 60 * 60 * 1000);
    await db.update(promoter).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(promoter.id, p.id));

    const link = urlSito(`/promoter/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('reset_password', {
      nome: p.nome, link, ore_validita: String(ORE_VALIDITA_TOKEN_RESET),
    });
    await inviaEmail({ a: p.email, oggetto, html });
  },

  async confermaResetPassword(token: string, nuovaPassword: string) {
    const [p] = await db.select().from(promoter).where(eq(promoter.tokenResetPassword, token)).limit(1);
    if (!p || !p.tokenResetPasswordScadenza || p.tokenResetPasswordScadenza < new Date()) {
      throw new NonAutorizzato('Link scaduto o non valido — richiedine uno nuovo.');
    }
    const passwordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.update(promoter).set({ passwordHash, tokenResetPassword: null, tokenResetPasswordScadenza: null }).where(eq(promoter.id, p.id));
  },

  /** Quante prenotazioni e quanto fatturato ha portato il codice di questo promoter. */
  async statistiche(codice: string) {
    const righe = await db.select().from(prenotazioni).where(and(eq(prenotazioni.promoterCodice, codice), eq(prenotazioni.stato, 'CONFERMATA')));
    const fatturato = righe.reduce((s, p) => s + Number(p.totale), 0);
    return { numeroPrenotazioni: righe.length, fatturato };
  },

  /** Stessa cosa, ma spezzata per evento — per la revenue cliccabile
   *  per evento nell'area promoter. */
  async statistichePerEvento(codice: string): Promise<Record<string, { numeroPrenotazioni: number; fatturato: number }>> {
    const righe = await db.select().from(prenotazioni).where(and(eq(prenotazioni.promoterCodice, codice), eq(prenotazioni.stato, 'CONFERMATA')));
    const risultato: Record<string, { numeroPrenotazioni: number; fatturato: number }> = {};
    for (const r of righe) {
      risultato[r.eventoId] ??= { numeroPrenotazioni: 0, fatturato: 0 };
      risultato[r.eventoId].numeroPrenotazioni++;
      risultato[r.eventoId].fatturato += Number(r.totale);
    }
    return risultato;
  },
};

export const promoterRouter = Router();

promoterRouter.post('/login', limiteAutenticazione, valida(loginPromoterSchema), asyncHandler(async (req: Request, res: Response) => res.json(await promoterService.login(req.body))));
promoterRouter.post('/richiedi-reset', limiteAutenticazione, valida(z.object({ email: z.string().email() })), asyncHandler(async (req: Request, res: Response) => {
  await promoterService.richiediResetPassword(req.body.email);
  res.json({ ok: true });
}));
promoterRouter.post('/reset-password', limiteAutenticazione, valida(z.object({ token: z.string(), password: z.string().min(8, 'La password deve avere almeno 8 caratteri.') })), asyncHandler(async (req: Request, res: Response) => {
  await promoterService.confermaResetPassword(req.body.token, req.body.password);
  res.json({ ok: true });
}));

// ---- Self-service: il promoter vede i propri dati con il proprio token,
// non serve un accesso da amministratore. ----
function richiedeAuthPromoter(req: Request, res: Response, next: () => void) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ errore: 'Token mancante' });
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as { sub: string; tipo?: string };
    if (payload.tipo !== 'promoter') return res.status(401).json({ errore: 'Token non valido per questo accesso' });
    (req as any).promoterId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ errore: 'Sessione scaduta o non valida, effettua di nuovo il login' });
  }
}

promoterRouter.get('/me', richiedeAuthPromoter, asyncHandler(async (req: Request, res: Response) => {
  res.json(await promoterService.getById((req as any).promoterId));
}));
promoterRouter.get('/me/statistiche', richiedeAuthPromoter, asyncHandler(async (req: Request, res: Response) => {
  const p = await promoterService.getById((req as any).promoterId);
  res.json(await promoterService.statistiche(p.codice));
}));
promoterRouter.get('/me/statistiche-per-evento', richiedeAuthPromoter, asyncHandler(async (req: Request, res: Response) => {
  const p = await promoterService.getById((req as any).promoterId);
  res.json(await promoterService.statistichePerEvento(p.codice));
}));

promoterRouter.use(richiedeAuth);
promoterRouter.get('/', richiedePermesso('promoter.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await promoterService.list())));
promoterRouter.get('/:id', richiedePermesso('promoter.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await promoterService.getById(req.params.id))));
promoterRouter.get('/:id/statistiche', richiedePermesso('promoter.visualizza'), asyncHandler(async (req: Request, res: Response) => {
  const p = await promoterService.getById(req.params.id);
  res.json(await promoterService.statistiche(p.codice));
}));
promoterRouter.post('/', richiedePermesso('promoter.gestisci'), valida(creaPromoterSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await promoterService.create(req.body);
  res.status(201).json(await promoterService.getById(id));
}));
promoterRouter.put('/:id', richiedePermesso('promoter.gestisci'), valida(aggiornaPromoterSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await promoterService.update(req.params.id, req.body);
  res.json(await promoterService.getById(id));
}));
promoterRouter.delete('/:id', richiedePermesso('promoter.gestisci'), asyncHandler(async (req: Request, res: Response) => { await promoterService.remove(req.params.id); res.status(204).send(); }));
