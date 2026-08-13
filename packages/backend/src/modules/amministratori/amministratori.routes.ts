import { Router, type Request, type Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../db/client.js';
import { amministratori, logAttivita } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';

const creaAdminSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  ruolo: z.enum(['AMMINISTRATORE', 'OPERATORE', 'COLLABORATORE']).default('OPERATORE'),
});
const aggiornaAdminSchema = creaAdminSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
  attivo: z.boolean().optional(),
});

async function getById(id: string) {
  const [a] = await db.select().from(amministratori).where(eq(amministratori.id, id)).limit(1);
  if (!a) throw new NonTrovato('Amministratore');
  return a;
}

/** Helper condiviso: qualsiasi service può registrare un'azione nel log,
 *  invece di riscrivere la stessa insert ovunque. */
export async function registraLog(amministratoreId: string | null, azione: string, dettaglio?: string) {
  await db.insert(logAttivita).values({ amministratoreId, azione, dettaglio });
}

export const amministratoriService = {
  list: () => db.select().from(amministratori),
  getById,
  create: async (input: z.infer<typeof creaAdminSchema>) => {
    const [nuovo] = await db.insert(amministratori).values({
      nome: input.nome, email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 10), ruolo: input.ruolo,
    }).returning();
    return nuovo;
  },
  update: async (id: string, input: z.infer<typeof aggiornaAdminSchema>) => {
    await getById(id);
    const [aggiornato] = await db.update(amministratori).set({
      ...(input.nome !== undefined && { nome: input.nome }),
      ...(input.email !== undefined && { email: input.email.toLowerCase() }),
      ...(input.ruolo !== undefined && { ruolo: input.ruolo }),
      ...(input.attivo !== undefined && { attivo: input.attivo }),
      ...(input.password && { passwordHash: await bcrypt.hash(input.password, 10) }),
    }).where(eq(amministratori.id, id)).returning();
    return aggiornato;
  },
  remove: async (id: string) => {
    await getById(id);
    await db.delete(amministratori).where(eq(amministratori.id, id));
  },
  log: (limite = 100) => db.select().from(logAttivita).orderBy(desc(logAttivita.data)).limit(limite),
};

export const amministratoriRouter = Router();
amministratoriRouter.use(richiedeAuth, richiedeRuolo('AMMINISTRATORE'));

amministratoriRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await amministratoriService.list())));
amministratoriRouter.get('/log', asyncHandler(async (_req: Request, res: Response) => res.json(await amministratoriService.log())));
amministratoriRouter.post('/', valida(creaAdminSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await amministratoriService.create(req.body))));
amministratoriRouter.put('/:id', valida(aggiornaAdminSchema), asyncHandler(async (req: Request, res: Response) => res.json(await amministratoriService.update(req.params.id, req.body))));
amministratoriRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => { await amministratoriService.remove(req.params.id); res.status(204).send(); }));
