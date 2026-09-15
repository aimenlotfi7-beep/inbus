import { Router, type Request, type Response } from 'express';
import { eq, count, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { amministratori, fornitori, fornitoriCampiExtraConfig, tragitti, preventiviRichieste, busFisici } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { urlSito } from '../../shared/email.service.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { haPermesso } from '../auth/permessi.service.js';
import { inviaEmailModello } from '../preventivi/email-fornitori.js';
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
  regione: z.string().nullable().optional(),
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
  regione: z.string().optional(),
  campiExtra: z.array(z.object({ etichetta: z.string().max(200), valore: z.string().max(2000) })).max(30).optional(),
});

const campoExtraConfigSchema = z.object({ etichetta: z.string().min(1), ordine: z.number().int().default(0) });

async function getById(id: string) {
  const [f] = await db.select().from(fornitori).where(eq(fornitori.id, id)).limit(1);
  if (!f) throw new NonTrovato('Fornitore');
  return f;
}

// Cosa punta a questo fornitore. Eliminarlo cancellerebbe lo storico
// delle richieste di preventivo (onDelete cascade) e lascerebbe partenze
// e bus senza fornitore (set null): con anche un solo collegamento
// l'eliminazione è bloccata, e il gestionale propone di disattivarlo.
async function collegamenti(id: string) {
  await getById(id);
  const [[partenze], [richiestePreventivo], [bus]] = await Promise.all([
    db.select({ valore: count() }).from(tragitti).where(eq(tragitti.fornitoreId, id)),
    db.select({ valore: count() }).from(preventiviRichieste).where(eq(preventiviRichieste.fornitoreId, id)),
    db.select({ valore: count() }).from(busFisici).where(eq(busFisici.fornitoreId, id)),
  ]);
  return { partenze: partenze.valore, richiestePreventivo: richiestePreventivo.valore, bus: bus.valore };
}

/** Chi riceve l'avviso di una nuova registrazione: le utenze attive del
 *  gestionale che possono approvare i fornitori. */
async function emailStaffFornitori(): Promise<string[]> {
  const staff = await db.select({ id: amministratori.id, email: amministratori.email }).from(amministratori).where(eq(amministratori.attivo, true));
  const conPermesso = await Promise.all(staff.map(async (a) => ((await haPermesso(a.id, 'fornitori.gestisci')) ? a.email : null)));
  return conPermesso.filter((email): email is string => !!email);
}

export const fornitoriService = {
  list: () => db.select().from(fornitori),
  getById,
  collegamenti,
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
    const c = await collegamenti(id);
    if (c.partenze + c.richiestePreventivo + c.bus > 0) {
      throw new ConflittoDati('Non si può eliminare: il fornitore è collegato a partenze, preventivi o bus e si perderebbe lo storico. Disattivalo invece.');
    }
    await db.delete(fornitori).where(eq(fornitori.id, id));
  },
  /** approvazioneComunicata: solo passando da "In attesa" ad "Approvato",
   *  se l'email al fornitore è partita (null se non c'era niente da mandare). */
  cambiaStato: async (id: string, stato: 'IN_ATTESA' | 'APPROVATO' | 'DISATTIVATO') => {
    const prima = await getById(id);
    const [aggiornato] = await db.update(fornitori).set({ stato }).where(eq(fornitori.id, id)).returning();
    const approvato = prima.stato === 'IN_ATTESA' && stato === 'APPROVATO';
    const approvazioneComunicata = approvato && aggiornato.email
      ? await inviaEmailModello(aggiornato.email, 'fornitore_approvato', { fornitore: aggiornato.nome })
      : null;
    return { ...aggiornato, approvazioneComunicata };
  },
  contaInAttesa: async () => {
    const [{ valore }] = await db.select({ valore: count() }).from(fornitori).where(eq(fornitori.stato, 'IN_ATTESA'));
    return valore;
  },
  registraPubblico: async (input: z.infer<typeof registrazioneSchema>) => {
    // Una sola registrazione per email: chi reinvia il form non crea
    // doppioni da approvare. Confronto senza maiuscole, come le email.
    const email = input.email.trim();
    const [giaRegistrato] = await db.select({ id: fornitori.id }).from(fornitori)
      .where(sql`lower(${fornitori.email}) = ${email.toLowerCase()}`).limit(1);
    if (giaRegistrato) throw new ConflittoDati('Questa email risulta già registrata come fornitore: non serve registrarsi di nuovo.');
    const [nuovo] = await db.insert(fornitori).values({ ...input, email, stato: 'IN_ATTESA' }).returning();
    // Prima non partiva niente: né la conferma al fornitore né l'avviso allo staff.
    await inviaEmailModello(email, 'fornitore_registrazione_ricevuta', { fornitore: nuovo.nome });
    const variabiliStaff = { fornitore: nuovo.nome, email, indirizzo: nuovo.indirizzo ?? '', link: urlSito('/admin.html?sezione=fornitori') };
    for (const destinatario of await emailStaffFornitori()) {
      await inviaEmailModello(destinatario, 'fornitore_nuova_registrazione', variabiliStaff);
    }
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
fornitoriRouter.get('/:id/collegamenti', richiedePermesso('fornitori.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await fornitoriService.collegamenti(req.params.id))));
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

