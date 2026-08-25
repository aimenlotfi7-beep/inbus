import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { organizzatori, organizzatoreEventi, eventi } from '../../db/schema.js';
import { NonTrovato, NonAutorizzato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { env } from '../../config/env.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';

const ORE_VALIDITA_TOKEN_RESET = 2;
function generaTokenReset() {
  return crypto.randomBytes(24).toString('hex');
}

const creaOrganizzatoreSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().optional(),
  password: z.string().min(6),
  note: z.string().optional(),
  eventiAbilitati: z.array(z.string()).default([]),
});
const aggiornaOrganizzatoreSchema = creaOrganizzatoreSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
});
const loginOrganizzatoreSchema = z.object({ email: z.string().email(), password: z.string() });

async function getById(id: string) {
  const [o] = await db.select().from(organizzatori).where(eq(organizzatori.id, id)).limit(1);
  if (!o) throw new NonTrovato('Organizzatore');
  const eventiAbilitati = await db.select().from(organizzatoreEventi).where(eq(organizzatoreEventi.organizzatoreId, id));
  return { ...o, eventiAbilitati: eventiAbilitati.map((e) => e.eventoId) };
}

export const organizzatoriService = {
  list: () => db.select().from(organizzatori),
  getById,

  /** L'evento associato a questo organizzatore, con i dati essenziali
   *  per il suo portale — mai dati finanziari o di altri organizzatori. */
  async eventiAssegnati(organizzatoreId: string) {
    const righe = await db
      .select({ evento: eventi })
      .from(organizzatoreEventi)
      .innerJoin(eventi, eq(organizzatoreEventi.eventoId, eventi.id))
      .where(eq(organizzatoreEventi.organizzatoreId, organizzatoreId));
    return righe.map((r) => r.evento);
  },

  async create(input: z.infer<typeof creaOrganizzatoreSchema>) {
    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(organizzatori).values({
        nome: input.nome, email: input.email.toLowerCase(), telefono: input.telefono,
        passwordHash: await bcrypt.hash(input.password, 10),
        note: input.note,
      }).returning();
      // A differenza dei promoter, un organizzatore NON è abilitato di
      // default a tutti gli eventi — l'associazione è sempre esplicita,
      // decisa dall'amministratore, mai automatica: l'evento resta di
      // INBUS, l'organizzatore vede solo quello che gli viene assegnato.
      if (input.eventiAbilitati.length) {
        await tx.insert(organizzatoreEventi).values(input.eventiAbilitati.map((eventoId) => ({ organizzatoreId: nuovo.id, eventoId })));
      }
      return nuovo.id;
    });
  },

  async update(id: string, input: z.infer<typeof aggiornaOrganizzatoreSchema>) {
    await getById(id);
    return db.transaction(async (tx) => {
      await tx.update(organizzatori).set({
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.email !== undefined && { email: input.email.toLowerCase() }),
        ...(input.telefono !== undefined && { telefono: input.telefono }),
        ...(input.password && { passwordHash: await bcrypt.hash(input.password, 10) }),
        ...(input.note !== undefined && { note: input.note }),
      }).where(eq(organizzatori.id, id));
      if (input.eventiAbilitati) {
        await tx.delete(organizzatoreEventi).where(eq(organizzatoreEventi.organizzatoreId, id));
        if (input.eventiAbilitati.length) {
          await tx.insert(organizzatoreEventi).values(input.eventiAbilitati.map((eventoId) => ({ organizzatoreId: id, eventoId })));
        }
      }
      return id;
    });
  },

  async remove(id: string) {
    await getById(id);
    await db.delete(organizzatori).where(eq(organizzatori.id, id));
  },

  async login(input: z.infer<typeof loginOrganizzatoreSchema>) {
    const [o] = await db.select().from(organizzatori).where(eq(organizzatori.email, input.email.toLowerCase())).limit(1);
    if (!o || !(await bcrypt.compare(input.password, o.passwordHash))) throw new NonAutorizzato('Email o password non corrette');
    const token = jwt.sign({ sub: o.id, tipo: 'organizzatore' }, env.JWT_SECRET, { expiresIn: '12h' });
    return { token, organizzatore: { id: o.id, nome: o.nome } };
  },

  async richiediResetPassword(email: string) {
    const [o] = await db.select().from(organizzatori).where(eq(organizzatori.email, email.toLowerCase())).limit(1);
    if (!o) return; // silenzioso apposta

    const token = generaTokenReset();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_RESET * 60 * 60 * 1000);
    await db.update(organizzatori).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(organizzatori.id, o.id));

    const link = urlSito(`/organizzatore/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('reset_password', {
      nome: o.nome, link, ore_validita: String(ORE_VALIDITA_TOKEN_RESET),
    });
    await inviaEmail({ a: o.email, oggetto, html });
  },

  async confermaResetPassword(token: string, nuovaPassword: string) {
    const [o] = await db.select().from(organizzatori).where(eq(organizzatori.tokenResetPassword, token)).limit(1);
    if (!o || !o.tokenResetPasswordScadenza || o.tokenResetPasswordScadenza < new Date()) {
      throw new NonAutorizzato('Link scaduto o non valido — richiedine uno nuovo.');
    }
    const passwordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.update(organizzatori).set({ passwordHash, tokenResetPassword: null, tokenResetPasswordScadenza: null }).where(eq(organizzatori.id, o.id));
  },
};

export const organizzatoriRouter = Router();

organizzatoriRouter.post('/login', valida(loginOrganizzatoreSchema), asyncHandler(async (req: Request, res: Response) => res.json(await organizzatoriService.login(req.body))));
organizzatoriRouter.post('/richiedi-reset', valida(z.object({ email: z.string().email() })), asyncHandler(async (req: Request, res: Response) => {
  await organizzatoriService.richiediResetPassword(req.body.email);
  res.json({ ok: true });
}));
organizzatoriRouter.post('/reset-password', valida(z.object({ token: z.string(), password: z.string().min(8, 'La password deve avere almeno 8 caratteri.') })), asyncHandler(async (req: Request, res: Response) => {
  await organizzatoriService.confermaResetPassword(req.body.token, req.body.password);
  res.json({ ok: true });
}));

// ---- Self-service: l'organizzatore vede i propri dati col proprio
// token — nessun accesso da amministratore serve per questa parte, ed
// è impossibile per lui vedere eventi non suoi (controllato lato
// server, mai fidandosi di un ID passato dal frontend). ----
function richiedeAuthOrganizzatore(req: Request, res: Response, next: () => void) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ errore: 'Token mancante' });
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as { sub: string; tipo?: string };
    if (payload.tipo !== 'organizzatore') return res.status(401).json({ errore: 'Token non valido per questo accesso' });
    (req as any).organizzatoreId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ errore: 'Sessione scaduta o non valida, effettua di nuovo il login' });
  }
}

organizzatoriRouter.get('/me', richiedeAuthOrganizzatore, asyncHandler(async (req: Request, res: Response) => {
  res.json(await organizzatoriService.getById((req as any).organizzatoreId));
}));
organizzatoriRouter.get('/me/eventi', richiedeAuthOrganizzatore, asyncHandler(async (req: Request, res: Response) => {
  res.json(await organizzatoriService.eventiAssegnati((req as any).organizzatoreId));
}));

organizzatoriRouter.use(richiedeAuth);
organizzatoriRouter.get('/', richiedePermesso('organizzatori.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await organizzatoriService.list())));
organizzatoriRouter.get('/:id', richiedePermesso('organizzatori.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await organizzatoriService.getById(req.params.id))));
organizzatoriRouter.post('/', richiedePermesso('organizzatori.gestisci'), valida(creaOrganizzatoreSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await organizzatoriService.create(req.body);
  res.status(201).json(await organizzatoriService.getById(id));
}));
organizzatoriRouter.put('/:id', richiedePermesso('organizzatori.gestisci'), valida(aggiornaOrganizzatoreSchema), asyncHandler(async (req: Request, res: Response) => {
  const id = await organizzatoriService.update(req.params.id, req.body);
  res.json(await organizzatoriService.getById(id));
}));
organizzatoriRouter.delete('/:id', richiedePermesso('organizzatori.gestisci'), asyncHandler(async (req: Request, res: Response) => { await organizzatoriService.remove(req.params.id); res.status(204).send(); }));
