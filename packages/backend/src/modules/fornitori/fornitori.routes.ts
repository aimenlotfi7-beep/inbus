import { Router, type Request, type Response } from 'express';
import { eq, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { fornitori, fornitoriCampiExtraConfig } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { limiteRegistrazione } from '../../shared/rateLimit.js';

const fornitoreSchema = z.object({
  nome: z.string().min(1),
  partitaIva: z.string().nullable().optional(),
  referente: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  indirizzo: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  invioAutomatico: z.boolean().optional(),
});
const aggiornaFornitoreSchema = fornitoreSchema.partial();
const cambiaStatoSchema = z.object({ stato: z.enum(['IN_ATTESA', 'APPROVATO', 'DISATTIVATO']) });

// Autoregistrazione pubblica — stessi campi fissi del form admin, più i
// campi extra (testo libero, etichetta+valore) configurati altrove.
// lat/lng arrivano già geocodificati dal form stesso (il browser lo fa
// prima di inviare, riusando la stessa funzione già usata in admin) —
// niente geocodifica lato server per questo modulo.
const registrazioneSchema = z.object({
  nome: z.string().min(1, 'La ragione sociale è obbligatoria.'),
  partitaIva: z.string().optional(),
  referente: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email non valida.'),
  indirizzo: z.string().min(1, 'L\'indirizzo è obbligatorio — serve per calcolare la distanza dagli eventi.'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  campiExtra: z.array(z.object({ etichetta: z.string().max(200), valore: z.string().max(2000) })).max(30).optional(),
});

const campoExtraConfigSchema = z.object({ etichetta: z.string().min(1), ordine: z.number().int().default(0) });

async function getById(id: string) {
  const [f] = await db.select().from(fornitori).where(eq(fornitori.id, id)).limit(1);
  if (!f) throw new NonTrovato('Fornitore');
  return f;
}

export const fornitoriService = {
  list: () => db.select().from(fornitori),
  getById,
  // Creato dall'admin da questa schermata — nasce già APPROVATO (il
  // default della colonna), l'approvazione manuale serve solo a chi
  // arriva dal form pubblico di autoregistrazione qui sotto.
  create: async (input: z.infer<typeof fornitoreSchema>) => {
    const [nuovo] = await db.insert(fornitori).values(input).returning();
    return nuovo;
  },
  update: async (id: string, input: z.infer<typeof aggiornaFornitoreSchema>) => {
    await getById(id);
    const [aggiornato] = await db.update(fornitori).set(input).where(eq(fornitori.id, id)).returning();
    return aggiornato;
  },
  remove: async (id: string) => {
    await getById(id);
    await db.delete(fornitori).where(eq(fornitori.id, id));
  },
  cambiaStato: async (id: string, stato: 'IN_ATTESA' | 'APPROVATO' | 'DISATTIVATO') => {
    await getById(id);
    const [aggiornato] = await db.update(fornitori).set({ stato }).where(eq(fornitori.id, id)).returning();
    return aggiornato;
  },
  contaInAttesa: async () => {
    const [{ valore }] = await db.select({ valore: count() }).from(fornitori).where(eq(fornitori.stato, 'IN_ATTESA'));
    return valore;
  },
  registraPubblico: async (input: z.infer<typeof registrazioneSchema>) => {
    const [nuovo] = await db.insert(fornitori).values({ ...input, stato: 'IN_ATTESA' }).returning();
    return nuovo;
  },
  listaCampiExtraConfig: () => db.select().from(fornitoriCampiExtraConfig).orderBy(fornitoriCampiExtraConfig.ordine),
  creaCampoExtraConfig: async (input: z.infer<typeof campoExtraConfigSchema>) => {
    const [nuovo] = await db.insert(fornitoriCampiExtraConfig).values(input).returning();
    return nuovo;
  },
  eliminaCampoExtraConfig: async (id: string) => {
    await db.delete(fornitoriCampiExtraConfig).where(eq(fornitoriCampiExtraConfig.id, id));
  },
};

export const fornitoriRouter = Router();

// ---------------------------------------------------------------------
// ROTTE PUBBLICHE — nessun accesso da amministratore richiesto, prima
// di ".use(richiedeAuth)" qui sotto (che si applica solo a quel che
// viene DOPO). Chiunque abbia il link può autoregistrarsi come
// fornitore, ma resta IN_ATTESA finché un admin non lo approva da
// Fornitori — vedi conversazione, rischio di autoregistrazioni non
// volute altrimenti.
// ---------------------------------------------------------------------
fornitoriRouter.get('/campi-extra-config', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await fornitoriService.listaCampiExtraConfig());
}));
fornitoriRouter.post('/registrazione', limiteRegistrazione, valida(registrazioneSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await fornitoriService.registraPubblico(req.body));
}));

fornitoriRouter.use(richiedeAuth);

fornitoriRouter.get('/', richiedePermesso('fornitori.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await fornitoriService.list())));
fornitoriRouter.get('/conta-in-attesa', richiedePermesso('fornitori.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json({ conteggio: await fornitoriService.contaInAttesa() })));
fornitoriRouter.get('/:id', richiedePermesso('fornitori.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await fornitoriService.getById(req.params.id))));
fornitoriRouter.post('/', richiedePermesso('fornitori.gestisci'), valida(fornitoreSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await fornitoriService.create(req.body))));
fornitoriRouter.put('/:id', richiedePermesso('fornitori.gestisci'), valida(aggiornaFornitoreSchema), asyncHandler(async (req: Request, res: Response) => res.json(await fornitoriService.update(req.params.id, req.body))));
fornitoriRouter.put('/:id/stato', richiedePermesso('fornitori.gestisci'), valida(cambiaStatoSchema), asyncHandler(async (req: Request, res: Response) => res.json(await fornitoriService.cambiaStato(req.params.id, req.body.stato))));
fornitoriRouter.delete('/:id', richiedePermesso('fornitori.elimina'), asyncHandler(async (req: Request, res: Response) => { await fornitoriService.remove(req.params.id); res.status(204).send(); }));

// Configurazione dei campi extra nel form pubblico — gestita
// dall'admin (schermata Impostazioni, o dentro Fornitori stesso).
fornitoriRouter.post('/campi-extra-config', richiedePermesso('fornitori.gestisci'), valida(campoExtraConfigSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await fornitoriService.creaCampoExtraConfig(req.body));
}));
fornitoriRouter.delete('/campi-extra-config/:id', richiedePermesso('fornitori.gestisci'), asyncHandler(async (req: Request, res: Response) => {
  await fornitoriService.eliminaCampoExtraConfig(req.params.id);
  res.status(204).send();
}));

