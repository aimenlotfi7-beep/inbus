import { Router, type Request, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../db/client.js';
import { amministratori, logAttivita, ruoli, ruoloPermessi, amministratorePermessi } from '../../db/schema.js';
import { NonTrovato, ConflittoDati, VietatoDaiPermessi } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { senzaSegreti } from '../../shared/segreti.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { PERMESSI_COLLABORATORE, permessiEffettivi, puoAssegnare } from '../auth/permessi.service.js';
import { eventiAssegnatiA } from '../collaboratori/collaboratori.routes.js';

const campiAdmin = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  // Per un collaboratore non serve: ha il ruolo di sistema "Collaboratore".
  ruoloId: z.string().min(1).optional(),
  // Collaboratore: vede e gestisce solo gli eventi di cui è responsabile.
  soloEventiAssegnati: z.boolean().optional(),
});
const creaAdminSchema = campiAdmin.refine((d) => d.soloEventiAssegnati || !!d.ruoloId, { message: 'Scegli il ruolo', path: ['ruoloId'] });
const aggiornaAdminSchema = campiAdmin.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
  attivo: z.boolean().optional(),
});

const NOME_RUOLO_COLLABORATORE = 'Collaboratore';

/** Il ruolo dei collaboratori, creato la prima volta che serve: nessun
 *  permesso suo, quelli operativi arrivano dalla casella "solo gli eventi di
 *  cui è responsabile" (PERMESSI_COLLABORATORE). Così per un collaboratore
 *  non si deve preparare un ruolo apposta (proprietario, settembre 2026). */
async function ruoloCollaboratore(): Promise<string> {
  await db.insert(ruoli).values({
    nome: NOME_RUOLO_COLLABORATORE,
    descrizione: 'Collaboratori esterni: la parte operativa dei loro eventi. I permessi li dà la casella «Vede solo gli eventi di cui è responsabile»; si tolgono dai permessi personali.',
    owner: false,
  }).onConflictDoNothing();
  const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.nome, NOME_RUOLO_COLLABORATORE)).limit(1);
  if (!ruolo || ruolo.owner) throw new ConflittoDati(`Il ruolo "${NOME_RUOLO_COLLABORATORE}" è un ruolo proprietario: rinominalo in Ruoli.`);
  return ruolo.id;
}

/** Un collaboratore riceve i permessi operativi: può crearlo solo chi li ha. */
async function controllaCollaboratore(adminId: string) {
  if (!(await puoAssegnare(adminId, [...PERMESSI_COLLABORATORE]))) {
    throw new VietatoDaiPermessi('Per creare un collaboratore devi avere tu tutti i permessi di eventi e partenze.');
  }
}

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
  // Mai hash e token nelle risposte (shared/segreti.ts).
  list: async () => (await db.select().from(amministratori)).map(senzaSegreti),
  getById,
  create: async (input: z.infer<typeof creaAdminSchema> & { ruoloId: string }) => {
    const [nuovo] = await db.insert(amministratori).values({
      nome: input.nome, email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 10), ruoloId: input.ruoloId,
      soloEventiAssegnati: input.soloEventiAssegnati ?? false,
    }).returning();
    return senzaSegreti(nuovo);
  },
  update: async (id: string, input: z.infer<typeof aggiornaAdminSchema>) => {
    await getById(id);
    const [aggiornato] = await db.update(amministratori).set({
      ...(input.nome !== undefined && { nome: input.nome }),
      ...(input.email !== undefined && { email: input.email.toLowerCase() }),
      ...(input.ruoloId !== undefined && { ruoloId: input.ruoloId }),
      ...(input.attivo !== undefined && { attivo: input.attivo }),
      ...(input.soloEventiAssegnati !== undefined && { soloEventiAssegnati: input.soloEventiAssegnati }),
      ...(input.password && { passwordHash: await bcrypt.hash(input.password, 10) }),
    }).where(eq(amministratori.id, id)).returning();
    return senzaSegreti(aggiornato);
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
    if (req.body.soloEventiAssegnati) {
      await controllaCollaboratore(req.admin!.sub);
      res.status(201).json(await amministratoriService.create({ ...req.body, ruoloId: await ruoloCollaboratore() }));
      return;
    }
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
    // Collaboratore: il ruolo è quello di sistema. Mai su sé stessi né su un
    // proprietario (si perderebbe l'accesso completo); tolta la casella serve
    // di nuovo un ruolo vero.
    if (req.body.soloEventiAssegnati === true && !target.soloEventiAssegnati) {
      if (target.id === req.admin!.sub) throw new ConflittoDati('Non puoi limitare la tua utenza ai soli eventi assegnati.');
      if (ruoloAttuale?.owner) throw new ConflittoDati("Un proprietario vede sempre tutto: per un collaboratore crea un'utenza a parte.");
      await controllaCollaboratore(req.admin!.sub);
    }
    if (req.body.soloEventiAssegnati === true || (req.body.soloEventiAssegnati === undefined && target.soloEventiAssegnati)) {
      req.body.ruoloId = await ruoloCollaboratore();
    } else if (req.body.soloEventiAssegnati === false && target.soloEventiAssegnati
      && (!req.body.ruoloId || req.body.ruoloId === target.ruoloId)) {
      throw new ConflittoDati('Togliendo «solo gli eventi di cui è responsabile» scegli il ruolo che avrà ora.');
    }
    if (req.body.ruoloId !== undefined) {
      const assegnabile = await ruoloEAssegnabileDa(req.body.ruoloId, eff);
      if (!assegnabile) {
        throw new VietatoDaiPermessi('Non puoi assegnare un ruolo con più permessi di quelli che hai tu.');
      }
    }
    // Disattivare: mai sé stessi (si resterebbe fuori) né l'ultimo proprietario attivo.
    if (req.body.attivo === false && target.attivo) {
      if (target.id === req.admin!.sub) throw new ConflittoDati('Non puoi disattivare la tua utenza.');
      if (ruoloAttuale?.owner) {
        const proprietariAttivi = await db.select({ id: amministratori.id }).from(amministratori)
          .where(and(eq(amministratori.ruoloId, target.ruoloId), eq(amministratori.attivo, true)));
        if (proprietariAttivi.filter((a) => a.id !== target.id).length === 0) {
          throw new ConflittoDati("Non puoi disattivare l'unica utenza proprietaria attiva.");
        }
      }
    }
    res.json(await amministratoriService.update(req.params.id, req.body));
  })
);

/** Link per scegliere una nuova password, a un collega: vale 24 ore. Stesse
 *  regole della modifica (un proprietario solo da un proprietario). */
amministratoriRouter.post(
  '/:id/link-password',
  richiedePermesso('utenze.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await getById(req.params.id);
    const eff = await permessiEffettivi(req.admin!.sub);
    const [ruoloTarget] = await db.select().from(ruoli).where(eq(ruoli.id, target.ruoloId)).limit(1);
    if (!eff.owner && ruoloTarget?.owner) {
      throw new VietatoDaiPermessi("Solo il proprietario può gestire un'altra utenza proprietaria.");
    }
    if (!target.attivo) throw new ConflittoDati(`${target.nome} è disattivato: riattivalo prima di mandargli il link.`);
    const { authService } = await import('../auth/auth.service.js');
    res.json(await authService.mandaLinkPassword(target, 24));
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
    // Chi è responsabile di eventi ha compensi da registrare: prima si
    // tolgono le assegnazioni (o si disattiva l'utenza, che le conserva).
    const assegnati = await eventiAssegnatiA(target.id);
    if (assegnati > 0) {
      throw new ConflittoDati(`${target.nome} è responsabile di ${assegnati === 1 ? 'un evento' : `${assegnati} eventi`}: toglilo dagli eventi, oppure disattiva l'utenza.`);
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
    const collaboratore = target.soloEventiAssegnati && !ruolo?.owner;

    res.json({
      ruoloOwner: ruolo?.owner ?? false,
      // Un collaboratore parte da tutta la parte operativa, e solo quella si può modificare.
      collaboratore,
      permessiRuolo: collaboratore ? [...PERMESSI_COLLABORATORE] : delRuolo,
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
    if (target.soloEventiAssegnati) {
      const fuori = req.body.eccezioni.filter((e: { chiave: string }) => !PERMESSI_COLLABORATORE.has(e.chiave));
      if (fuori.length > 0) throw new ConflittoDati('A un collaboratore si possono togliere o ridare solo i permessi della parte operativa.');
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
