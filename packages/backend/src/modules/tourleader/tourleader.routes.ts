import { Router, type Request, type Response } from 'express';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { tourLeader } from '../../db/schema.js';
import { ConflittoDati, NonTrovato } from '../../shared/errors.js';
import { senzaSegreti } from '../../shared/segreti.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

const candidaturaSchema = z.object({
  nome: z.string().min(1),
  cognome: z.string().min(1),
  // Sempre minuscola: l'accesso alla scansione la cerca così.
  email: z.string().trim().email().transform((e) => e.toLowerCase()),
  telefono: z.string().optional(),
  dataNascita: z.coerce.date().optional(),
  citta: z.string().optional(),
  lingue: z.string().optional(),
  disponibilita: z.string().optional(),
  esperienza: z.string().optional(),
  note: z.string().optional(),
  eventoRiferimento: z.string().optional(),
});
const aggiornaSchema = candidaturaSchema.partial().extend({
  stato: z.enum(['CANDIDATO', 'ATTIVO', 'ARCHIVIATO']).optional(),
});
const creaAmministrativoSchema = candidaturaSchema.extend({
  stato: z.enum(['CANDIDATO', 'ATTIVO', 'ARCHIVIATO']).optional(),
});

/** Mai hash della password né token di reset (con il link di invito o
 *  reset si prende l'account) — solo se una password è impostata. */
function senzaPassword<T extends { passwordHash: string | null }>(riga: T) {
  const { passwordImpostata, ...resto } = senzaSegreti(riga);
  return { ...resto, passwordAttiva: passwordImpostata ?? false };
}

async function getById(id: string) {
  const [t] = await db.select().from(tourLeader).where(eq(tourLeader.id, id)).limit(1);
  if (!t) throw new NonTrovato('Tour leader');
  return senzaPassword(t);
}

/** Un'email per tour leader: con due uguali l'accesso alla scansione
 *  entrerebbe in uno a caso. Confronto senza maiuscole (anche le vecchie). */
async function verificaEmailLibera(email: string, messaggio: string, escludiId?: string) {
  const [gia] = await db.select({ id: tourLeader.id }).from(tourLeader)
    .where(and(sql`lower(${tourLeader.email}) = ${email.toLowerCase()}`, escludiId ? ne(tourLeader.id, escludiId) : undefined)).limit(1);
  if (gia) throw new ConflittoDati(messaggio);
}

const EMAIL_GIA_USATA = 'Esiste già un tour leader con questa email.';

export const tourLeaderService = {
  list: async () => (await db.select().from(tourLeader)).map(senzaPassword),
  getById,
  candidati: async (input: z.infer<typeof candidaturaSchema>) => {
    await verificaEmailLibera(input.email, 'Con questa email c\'è già una candidatura: ti ricontatteremo noi.');
    const [nuovo] = await db.insert(tourLeader).values({ ...input, stato: 'CANDIDATO' }).returning();
    return senzaPassword(nuovo);
  },
  // Censimento diretto dal gestionale (non passa dal form pubblico): chi
  // lo crea decide subito lo stato, di default ATTIVO dato che è già
  // stato valutato per essere censito qui.
  creaAmministrativo: async (input: z.infer<typeof candidaturaSchema> & { stato?: 'CANDIDATO' | 'ATTIVO' | 'ARCHIVIATO' }) => {
    await verificaEmailLibera(input.email, EMAIL_GIA_USATA);
    const [nuovo] = await db.insert(tourLeader).values({ ...input, stato: input.stato ?? 'ATTIVO' }).returning();
    return senzaPassword(nuovo);
  },
  update: async (id: string, input: z.infer<typeof aggiornaSchema>) => {
    await getById(id);
    if (input.email) await verificaEmailLibera(input.email, EMAIL_GIA_USATA, id);
    const [aggiornato] = await db.update(tourLeader).set(input).where(eq(tourLeader.id, id)).returning();
    return senzaPassword(aggiornato);
  },
  remove: async (id: string) => {
    await getById(id);
    await db.delete(tourLeader).where(eq(tourLeader.id, id));
  },
};

export const tourLeaderRouter = Router();

// Pubblico: il form di autocandidatura (nessun login richiesto)
tourLeaderRouter.post('/candidatura', valida(candidaturaSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await tourLeaderService.candidati(req.body));
}));

// Amministrazione
tourLeaderRouter.use(richiedeAuth);
tourLeaderRouter.get('/', richiedePermesso('tourleader.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await tourLeaderService.list())));
tourLeaderRouter.post('/', richiedePermesso('tourleader.gestisci'), valida(creaAmministrativoSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await tourLeaderService.creaAmministrativo(req.body))));
tourLeaderRouter.get('/:id', richiedePermesso('tourleader.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await tourLeaderService.getById(req.params.id))));
tourLeaderRouter.put('/:id', richiedePermesso('tourleader.gestisci'), valida(aggiornaSchema), asyncHandler(async (req: Request, res: Response) => res.json(await tourLeaderService.update(req.params.id, req.body))));
tourLeaderRouter.delete('/:id', richiedePermesso('tourleader.gestisci'), asyncHandler(async (req: Request, res: Response) => { await tourLeaderService.remove(req.params.id); res.status(204).send(); }));
