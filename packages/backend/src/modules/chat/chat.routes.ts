import { Router, type Request, type Response } from 'express';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { messaggiChat, conversazioniChat, eventi } from '../../db/schema.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { NonTrovato } from '../../shared/errors.js';

const inviaClienteSchema = z.object({
  eventoId: z.string().min(1),
  nome: z.string().min(1),
  email: z.string().email(),
  testo: z.string().min(1),
});
const rispondiSchema = z.object({ testo: z.string().min(1) });

export const chatService = {
  /** La conversazione ancora "viva" (aperta o in corso) di un cliente,
   *  qualsiasi evento — un cliente ha sempre al più UNA conversazione
   *  attiva alla volta. Se l'ultima è stata chiusa, non conta più: il
   *  prossimo messaggio ne aprirà una nuova. */
  async conversazioneAttiva(email: string) {
    const [conv] = await db.select().from(conversazioniChat)
      .where(and(eq(conversazioniChat.clienteEmail, email.toLowerCase()), ne(conversazioniChat.stato, 'CHIUSA')))
      .orderBy(desc(conversazioniChat.ultimoMessaggioIl))
      .limit(1);
    return conv ?? null;
  },

  /** Tutte le conversazioni di un cliente (aperte e chiuse), con i
   *  relativi messaggi — per lo storico lato cliente. */
  async storicoCliente(email: string) {
    const conversazioni = await db.select().from(conversazioniChat)
      .where(eq(conversazioniChat.clienteEmail, email.toLowerCase()))
      .orderBy(desc(conversazioniChat.ultimoMessaggioIl));
    const risultato = [];
    for (const c of conversazioni) {
      const messaggi = await db.select().from(messaggiChat).where(eq(messaggiChat.conversazioneId, c.id)).orderBy(messaggiChat.creatoIl);
      risultato.push({ ...c, messaggi });
    }
    return risultato;
  },

  /** Il cliente scrive — continua la conversazione attiva se ce n'è
   *  una, altrimenti ne apre una nuova (anche se ce n'erano di chiuse
   *  in passato, restano nello storico separate). */
  async inviaCliente(input: z.infer<typeof inviaClienteSchema>) {
    let conv = await this.conversazioneAttiva(input.email);
    if (!conv) {
      const [nuova] = await db.insert(conversazioniChat).values({
        eventoId: input.eventoId,
        clienteEmail: input.email.toLowerCase(),
        clienteNome: input.nome,
      }).returning();
      conv = nuova;
    }
    const [messaggio] = await db.insert(messaggiChat).values({
      eventoId: conv.eventoId,
      conversazioneId: conv.id,
      autore: 'CLIENTE',
      nome: input.nome,
      email: input.email.toLowerCase(),
      testo: input.testo,
    }).returning();
    await db.update(conversazioniChat).set({ ultimoMessaggioIl: new Date() }).where(eq(conversazioniChat.id, conv.id));
    return messaggio;
  },

  /** Elenco conversazioni per l'admin — con nome cliente ed evento,
   *  come richiesto (stessa idea della lista Prenotazioni). */
  async listaConversazioni(soloStato?: 'APERTA' | 'IN_CORSO' | 'CHIUSA') {
    return db
      .select({
        id: conversazioniChat.id,
        stato: conversazioniChat.stato,
        clienteNome: conversazioniChat.clienteNome,
        clienteEmail: conversazioniChat.clienteEmail,
        eventoId: conversazioniChat.eventoId,
        eventoArtista: eventi.artista,
        creataIl: conversazioniChat.creataIl,
        ultimoMessaggioIl: conversazioniChat.ultimoMessaggioIl,
        nonLetti: sql<number>`(select count(*)::int from ${messaggiChat} where ${messaggiChat.conversazioneId} = ${conversazioniChat.id} and ${messaggiChat.autore} = 'CLIENTE' and ${messaggiChat.letto} = false)`,
      })
      .from(conversazioniChat)
      .innerJoin(eventi, eq(eventi.id, conversazioniChat.eventoId))
      .where(soloStato ? eq(conversazioniChat.stato, soloStato) : undefined)
      .orderBy(desc(conversazioniChat.ultimoMessaggioIl));
  },

  async messaggiConversazione(id: string) {
    return db.select().from(messaggiChat).where(eq(messaggiChat.conversazioneId, id)).orderBy(messaggiChat.creatoIl);
  },

  /** L'admin risponde — se la conversazione era ancora "aperta" (il
   *  cliente ha scritto ma nessuno ha risposto), rispondere la porta
   *  automaticamente a "in corso". */
  async rispondi(conversazioneId: string, testo: string) {
    const [conv] = await db.select().from(conversazioniChat).where(eq(conversazioniChat.id, conversazioneId)).limit(1);
    if (!conv) throw new NonTrovato('Conversazione');

    const [messaggio] = await db.insert(messaggiChat).values({
      eventoId: conv.eventoId,
      conversazioneId: conv.id,
      autore: 'ADMIN',
      nome: 'Staff OnWay',
      testo,
      letto: true,
    }).returning();
    await db.update(conversazioniChat).set({
      ultimoMessaggioIl: new Date(),
      stato: conv.stato === 'APERTA' ? 'IN_CORSO' : conv.stato,
    }).where(eq(conversazioniChat.id, conv.id));
    return messaggio;
  },

  async segnaLetti(conversazioneId: string) {
    await db.update(messaggiChat).set({ letto: true }).where(eq(messaggiChat.conversazioneId, conversazioneId));
  },

  async chiudi(conversazioneId: string) {
    const [conv] = await db.select().from(conversazioniChat).where(eq(conversazioniChat.id, conversazioneId)).limit(1);
    if (!conv) throw new NonTrovato('Conversazione');
    await db.update(conversazioniChat).set({ stato: 'CHIUSA' }).where(eq(conversazioniChat.id, conversazioneId));
  },

  async riapri(conversazioneId: string) {
    const [conv] = await db.select().from(conversazioniChat).where(eq(conversazioniChat.id, conversazioneId)).limit(1);
    if (!conv) throw new NonTrovato('Conversazione');
    await db.update(conversazioniChat).set({ stato: 'IN_CORSO' }).where(eq(conversazioniChat.id, conversazioneId));
  },

  /** Per il pallino di avviso nel menu — conversazioni con almeno un
   *  messaggio del cliente non ancora letto, non chiuse. */
  async contaNonLette() {
    const [{ n }] = await db
      .select({ n: sql<number>`count(distinct ${conversazioniChat.id})::int` })
      .from(conversazioniChat)
      .innerJoin(messaggiChat, eq(messaggiChat.conversazioneId, conversazioniChat.id))
      .where(and(ne(conversazioniChat.stato, 'CHIUSA'), eq(messaggiChat.autore, 'CLIENTE'), eq(messaggiChat.letto, false)));
    return n;
  },
};

export const chatRouter = Router();

// Pubblico: il cliente scrive e legge la propria conversazione senza login admin
chatRouter.post('/', valida(inviaClienteSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await chatService.inviaCliente(req.body))));
chatRouter.get('/by-email', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(async (req: Request, res: Response) => res.json(await chatService.storicoCliente(String(req.query.email)))));

// Admin: elenco conversazioni, dettaglio, risposta, stati
chatRouter.get('/conversazioni', richiedeAuth, richiedePermesso('chat.visualizza'), asyncHandler(async (req: Request, res: Response) => {
  const stato = req.query.stato as 'APERTA' | 'IN_CORSO' | 'CHIUSA' | undefined;
  res.json(await chatService.listaConversazioni(stato));
}));
chatRouter.get('/conversazioni/non-lette', richiedeAuth, richiedePermesso('chat.visualizza'), asyncHandler(async (_req: Request, res: Response) => {
  res.json({ conteggio: await chatService.contaNonLette() });
}));
chatRouter.get('/conversazioni/:id/messaggi', richiedeAuth, richiedePermesso('chat.visualizza'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatService.messaggiConversazione(req.params.id));
}));
chatRouter.post('/conversazioni/:id/rispondi', richiedeAuth, richiedePermesso('chat.rispondi'), valida(rispondiSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await chatService.rispondi(req.params.id, req.body.testo));
}));
chatRouter.post('/conversazioni/:id/segna-letti', richiedeAuth, richiedePermesso('chat.rispondi'), asyncHandler(async (req: Request, res: Response) => {
  await chatService.segnaLetti(req.params.id);
  res.status(204).send();
}));
chatRouter.post('/conversazioni/:id/chiudi', richiedeAuth, richiedePermesso('chat.rispondi'), asyncHandler(async (req: Request, res: Response) => {
  await chatService.chiudi(req.params.id);
  res.json({ ok: true });
}));
chatRouter.post('/conversazioni/:id/riapri', richiedeAuth, richiedePermesso('chat.rispondi'), asyncHandler(async (req: Request, res: Response) => {
  await chatService.riapri(req.params.id);
  res.json({ ok: true });
}));
