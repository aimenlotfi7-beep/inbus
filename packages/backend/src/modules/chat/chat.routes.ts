import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { messaggiChat } from '../../db/schema.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';

const inviaMessaggioSchema = z.object({
  eventoId: z.string().min(1),
  autore: z.enum(['CLIENTE', 'ADMIN']),
  nome: z.string().min(1),
  email: z.string().email().optional(),
  testo: z.string().min(1),
});

export const chatService = {
  /** Storico completo di un cliente, a prescindere dall'evento — lo stesso
   *  raggruppamento "per persona, non per evento" scelto nel prototipo. */
  storicoCliente: (email: string) =>
    db.select().from(messaggiChat).where(eq(messaggiChat.email, email.toLowerCase())).orderBy(messaggiChat.creatoIl),

  perEvento: (eventoId: string) =>
    db.select().from(messaggiChat).where(eq(messaggiChat.eventoId, eventoId)).orderBy(messaggiChat.creatoIl),

  invia: async (input: z.infer<typeof inviaMessaggioSchema>) => {
    const [nuovo] = await db.insert(messaggiChat).values({
      eventoId: input.eventoId,
      autore: input.autore,
      nome: input.nome,
      email: input.email?.toLowerCase(),
      testo: input.testo,
      letto: input.autore === 'ADMIN', // i messaggi dell'admin sono già "letti" da sé stesso
    }).returning();
    return nuovo;
  },

  segnaLetti: async (email: string) => {
    await db.update(messaggiChat).set({ letto: true }).where(eq(messaggiChat.email, email.toLowerCase()));
  },
};

export const chatRouter = Router();

// Pubblico: il cliente scrive e legge la propria conversazione senza login admin
chatRouter.post('/', valida(inviaMessaggioSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await chatService.invia(req.body))));
chatRouter.get('/by-email', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(async (req: Request, res: Response) => res.json(await chatService.storicoCliente(String(req.query.email)))));

// Admin: vista per evento e segna-come-letto
chatRouter.get('/by-evento/:eventoId', richiedeAuth, richiedeRuolo('AMMINISTRATORE', 'OPERATORE', 'COLLABORATORE'), asyncHandler(async (req: Request, res: Response) => res.json(await chatService.perEvento(req.params.eventoId))));
chatRouter.post('/segna-letti', richiedeAuth, richiedeRuolo('AMMINISTRATORE', 'OPERATORE'), valida(z.object({ email: z.string().email() })), asyncHandler(async (req: Request, res: Response) => { await chatService.segnaLetti(req.body.email); res.status(204).send(); }));
