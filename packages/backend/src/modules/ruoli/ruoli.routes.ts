import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { ruoli, ruoloPermessi, permessi, amministratori } from '../../db/schema.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { NonTrovato, ConflittoDati, VietatoDaiPermessi } from '../../shared/errors.js';
import { permessiEffettivi, chiaviNonPossedute } from '../auth/permessi.service.js';

const creaRuoloSchema = z.object({
  nome: z.string().min(1),
  descrizione: z.string().optional(),
  permessi: z.array(z.string()).default([]),
});
const aggiornaRuoloSchema = creaRuoloSchema.partial();

export const ruoliRouter = Router();
ruoliRouter.use(richiedeAuth);

/** Permessi che l'utente loggato PUÒ assegnare ad altri (a un ruolo che
 *  crea, o a un'utenza che crea): se è owner, tutti quelli attivi; se no,
 *  solo il sotto-insieme che possiede lui stesso. Il frontend usa questo
 *  endpoint per mostrare solo i checkbox che l'utente può davvero spuntare —
 *  così "le autorizzazioni che un'utenza può attribuire sono al massimo
 *  quelle a cui è abilitata" è garantito sia in UI che lato server. */
ruoliRouter.get('/permessi-assegnabili', asyncHandler(async (req: Request, res: Response) => {
  const tuttiAttivi = await db.select().from(permessi).where(eq(permessi.attivo, true));
  const eff = await permessiEffettivi(req.admin!.sub);
  const assegnabili = eff.owner ? tuttiAttivi : tuttiAttivi.filter((p) => eff.permessi.has(p.chiave));
  res.json(assegnabili);
}));

/** Ruoli che l'utente loggato può assegnare ad altri (creando o modificando
 *  un'utenza): un ruolo è assegnabile se TUTTI i suoi permessi sono un
 *  sotto-insieme di quelli dell'utente loggato. Il ruolo owner è assegnabile
 *  solo da chi è già owner. */
ruoliRouter.get('/assegnabili', asyncHandler(async (req: Request, res: Response) => {
  const eff = await permessiEffettivi(req.admin!.sub);
  const listaRuoli = await db.select().from(ruoli);

  const risultato = [];
  for (const r of listaRuoli) {
    if (r.owner) {
      if (eff.owner) risultato.push({ ...r, permessi: ['*'] });
      continue;
    }
    const assegnati = await db.select().from(ruoloPermessi).where(eq(ruoloPermessi.ruoloId, r.id));
    const chiavi = assegnati.map((a) => a.permessoChiave);
    if (eff.owner || chiavi.every((c) => eff.permessi.has(c))) {
      risultato.push({ ...r, permessi: chiavi });
    }
  }
  res.json(risultato);
}));

// Elenco completo dei ruoli con permessi — per la pagina di gestione ruoli.
ruoliRouter.get('/', richiedePermesso('permessi.gestisci'), asyncHandler(async (_req: Request, res: Response) => {
  const listaRuoli = await db.select().from(ruoli);
  const risultato = await Promise.all(listaRuoli.map(async (r) => {
    if (r.owner) return { ...r, permessi: ['*'] };
    const assegnati = await db.select().from(ruoloPermessi).where(eq(ruoloPermessi.ruoloId, r.id));
    return { ...r, permessi: assegnati.map((a) => a.permessoChiave) };
  }));
  res.json(risultato);
}));

ruoliRouter.post(
  '/',
  richiedePermesso('permessi.gestisci'),
  valida(creaRuoloSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const nonPossedute = await chiaviNonPossedute(req.admin!.sub, req.body.permessi);
    if (nonPossedute.length > 0) {
      throw new VietatoDaiPermessi(`Non puoi assegnare permessi che non possiedi: ${nonPossedute.join(', ')}`);
    }

    const [nuovo] = await db.insert(ruoli).values({
      nome: req.body.nome,
      descrizione: req.body.descrizione,
    }).returning();

    if (req.body.permessi.length > 0) {
      await db.insert(ruoloPermessi).values(
        req.body.permessi.map((chiave: string) => ({ ruoloId: nuovo.id, permessoChiave: chiave }))
      );
    }
    res.status(201).json(nuovo);
  })
);

ruoliRouter.put(
  '/:id',
  richiedePermesso('permessi.gestisci'),
  valida(aggiornaRuoloSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const [esiste] = await db.select().from(ruoli).where(eq(ruoli.id, id)).limit(1);
    if (!esiste) throw new NonTrovato('Ruolo');
    if (esiste.owner) throw new ConflittoDati('I permessi del ruolo proprietario non sono modificabili: ne ha sempre di ogni tipo.');

    if (req.body.permessi !== undefined) {
      const nonPossedute = await chiaviNonPossedute(req.admin!.sub, req.body.permessi);
      if (nonPossedute.length > 0) {
        throw new VietatoDaiPermessi(`Non puoi assegnare permessi che non possiedi: ${nonPossedute.join(', ')}`);
      }
    }

    if (req.body.nome !== undefined || req.body.descrizione !== undefined) {
      await db.update(ruoli).set({
        ...(req.body.nome !== undefined && { nome: req.body.nome }),
        ...(req.body.descrizione !== undefined && { descrizione: req.body.descrizione }),
      }).where(eq(ruoli.id, id));
    }

    if (req.body.permessi !== undefined) {
      await db.delete(ruoloPermessi).where(eq(ruoloPermessi.ruoloId, id));
      if (req.body.permessi.length > 0) {
        await db.insert(ruoloPermessi).values(
          req.body.permessi.map((chiave: string) => ({ ruoloId: id, permessoChiave: chiave }))
        );
      }
    }
    res.json({ ok: true });
  })
);

ruoliRouter.delete(
  '/:id',
  richiedePermesso('permessi.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, id)).limit(1);
    if (!ruolo) throw new NonTrovato('Ruolo');
    if (ruolo.owner) throw new ConflittoDati('Il ruolo proprietario non può essere eliminato.');

    const utenzeConQuestoRuolo = await db.select().from(amministratori).where(eq(amministratori.ruoloId, id));
    if (utenzeConQuestoRuolo.length > 0) {
      throw new ConflittoDati(`Ci sono ${utenzeConQuestoRuolo.length} utenze con questo ruolo: riassegnale prima di eliminarlo.`);
    }

    await db.delete(ruoli).where(eq(ruoli.id, id));
    res.status(204).send();
  })
);
