import { Router, type Request, type Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../db/client.js';
import { amministratori, logAttivita, ruoli, ruoloPermessi, amministratorePermessi } from '../../db/schema.js';
import { NonTrovato, ConflittoDati, VietatoDaiPermessi } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { permessiEffettivi } from '../auth/permessi.service.js';

const creaAdminSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  ruoloId: z.string().min(1),
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

/** Vero se il ruolo `ruoloId` è assegnabile da chi ha i permessi `eff`:
 *  il ruolo owner solo da chi è già owner, gli altri ruoli solo se tutti
 *  i loro permessi sono un sotto-insieme di quelli di chi assegna. */
async function ruoloEAssegnabileDa(ruoloId: string, eff: Awaited<ReturnType<typeof permessiEffettivi>>) {
  const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, ruoloId)).limit(1);
  if (!ruolo) throw new NonTrovato('Ruolo');
  if (ruolo.owner) return eff.owner;
  if (eff.owner) return true;
  const assegnati = await db.select().from(ruoloPermessi).where(eq(ruoloPermessi.ruoloId, ruoloId));
  return assegnati.every((a) => eff.permessi.has(a.permessoChiave));
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
      passwordHash: await bcrypt.hash(input.password, 10), ruoloId: input.ruoloId,
    }).returning();
    return nuovo;
  },
  update: async (id: string, input: z.infer<typeof aggiornaAdminSchema>) => {
    await getById(id);
    const [aggiornato] = await db.update(amministratori).set({
      ...(input.nome !== undefined && { nome: input.nome }),
      ...(input.email !== undefined && { email: input.email.toLowerCase() }),
      ...(input.ruoloId !== undefined && { ruoloId: input.ruoloId }),
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
amministratoriRouter.use(richiedeAuth);

amministratoriRouter.get('/', richiedePermesso('utenze.gestisci'), asyncHandler(async (_req: Request, res: Response) => res.json(await amministratoriService.list())));
amministratoriRouter.get('/log', richiedePermesso('utenze.gestisci'), asyncHandler(async (_req: Request, res: Response) => res.json(await amministratoriService.log())));

amministratoriRouter.post(
  '/',
  richiedePermesso('utenze.crea'),
  valida(creaAdminSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const eff = await permessiEffettivi(req.admin!.sub);
    const assegnabile = await ruoloEAssegnabileDa(req.body.ruoloId, eff);
    if (!assegnabile) {
      throw new VietatoDaiPermessi("Non puoi creare un'utenza con un ruolo che ha più permessi di quelli che hai tu.");
    }
    res.status(201).json(await amministratoriService.create(req.body));
  })
);

amministratoriRouter.put(
  '/:id',
  richiedePermesso('utenze.gestisci'),
  valida(aggiornaAdminSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await getById(req.params.id);
    const eff = await permessiEffettivi(req.admin!.sub);

    // Chi non è owner non può modificare un'utenza owner, né promuovere
    // qualcuno a owner.
    const [ruoloAttuale] = await db.select().from(ruoli).where(eq(ruoli.id, target.ruoloId)).limit(1);
    if (!eff.owner && ruoloAttuale?.owner) {
      throw new VietatoDaiPermessi("Solo il proprietario può modificare un'altra utenza proprietaria.");
    }
    if (req.body.ruoloId !== undefined) {
      const assegnabile = await ruoloEAssegnabileDa(req.body.ruoloId, eff);
      if (!assegnabile) {
        throw new VietatoDaiPermessi('Non puoi assegnare un ruolo con più permessi di quelli che hai tu.');
      }
    }
    res.json(await amministratoriService.update(req.params.id, req.body));
  })
);

amministratoriRouter.delete(
  '/:id',
  richiedePermesso('utenze.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await getById(req.params.id);
    const eff = await permessiEffettivi(req.admin!.sub);
    const [ruoloTarget] = await db.select().from(ruoli).where(eq(ruoli.id, target.ruoloId)).limit(1);
    if (ruoloTarget?.owner) {
      if (!eff.owner) throw new VietatoDaiPermessi("Solo il proprietario può eliminare un'utenza proprietaria.");
      const altriOwner = await db.select().from(amministratori).where(eq(amministratori.ruoloId, target.ruoloId));
      if (altriOwner.filter((a) => a.id !== target.id).length === 0) {
        throw new ConflittoDati("Non puoi eliminare l'unica utenza proprietaria rimasta.");
      }
    }
    await amministratoriService.remove(req.params.id);
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------
// Eccezioni di permesso per singolo amministratore, oltre al suo ruolo.
// ---------------------------------------------------------------------

const eccezioniSchema = z.object({
  eccezioni: z.array(z.object({ chiave: z.string(), concesso: z.boolean() })),
});

amministratoriRouter.get(
  '/:id/permessi',
  richiedePermesso('utenze.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await getById(req.params.id);
    const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, target.ruoloId)).limit(1);
    const delRuolo = ruolo?.owner
      ? ['*']
      : (await db.select().from(ruoloPermessi).where(eq(ruoloPermessi.ruoloId, target.ruoloId))).map((r) => r.permessoChiave);
    const eccezioni = await db.select().from(amministratorePermessi).where(eq(amministratorePermessi.amministratoreId, target.id));
    const eff = await permessiEffettivi(target.id);

    res.json({
      ruoloOwner: ruolo?.owner ?? false,
      permessiRuolo: delRuolo,
      eccezioni: eccezioni.map((e) => ({ chiave: e.permessoChiave, concesso: e.concesso })),
      effettivi: eff.owner ? ['*'] : Array.from(eff.permessi),
    });
  })
);

amministratoriRouter.put(
  '/:id/permessi',
  richiedePermesso('utenze.gestisci'),
  valida(eccezioniSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await getById(req.params.id);
    const [ruoloTarget] = await db.select().from(ruoli).where(eq(ruoli.id, target.ruoloId)).limit(1);
    if (ruoloTarget?.owner) {
      throw new ConflittoDati('Il proprietario ha già tutti i permessi: non servono eccezioni personali.');
    }

    const eff = await permessiEffettivi(req.admin!.sub);
    if (!eff.owner) {
      const chiaviDaConcedere = req.body.eccezioni.filter((e: { chiave: string; concesso: boolean }) => e.concesso).map((e: { chiave: string }) => e.chiave);
      const nonPossedute = chiaviDaConcedere.filter((c: string) => !eff.permessi.has(c));
      if (nonPossedute.length > 0) {
        throw new VietatoDaiPermessi(`Non puoi concedere permessi che non possiedi: ${nonPossedute.join(', ')}`);
      }
    }

    await db.delete(amministratorePermessi).where(eq(amministratorePermessi.amministratoreId, target.id));
    if (req.body.eccezioni.length > 0) {
      await db.insert(amministratorePermessi).values(
        req.body.eccezioni.map((e: { chiave: string; concesso: boolean }) => ({
          amministratoreId: target.id, permessoChiave: e.chiave, concesso: e.concesso,
        }))
      );
    }
    res.json({ ok: true });
  })
);
