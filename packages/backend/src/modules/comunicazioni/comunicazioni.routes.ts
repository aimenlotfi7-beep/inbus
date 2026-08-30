import { Router, type Request, type Response } from 'express';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { comunicazioni, prenotazioni, utenti, tragitti, fermate, conversazioniChat, messaggiChat, eventi } from '../../db/schema.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { inviaEmail } from '../../shared/email.service.js';

const filtroSchema = z.object({
  servizioIds: z.array(z.string()).default([]),
  tragittoId: z.string().optional(),
  fermataId: z.string().optional(),
});
const inviaComunicazioneSchema = filtroSchema.extend({
  oggetto: z.string().min(1),
  corpo: z.string().min(1),
  canali: z.array(z.enum(['EMAIL', 'CHAT'])).min(1),
});
export type FiltroComunicazione = z.infer<typeof filtroSchema>;

async function trovaDestinatari(eventoId: string, filtro: FiltroComunicazione) {
  const condizioni = [eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')];

  if (filtro.fermataId) {
    // Le prenotazioni non hanno una chiave esterna vera alla fermata
    // (salvano città/indirizzo come testo, non un id) — quindi si
    // risale prima alla città della fermata scelta, e si filtra per
    // quella città DENTRO la tratta giusta (il nome città da solo
    // potrebbe ripetersi su tratte diverse).
    const [fermataScelta] = await db.select().from(fermate).where(eq(fermate.id, filtro.fermataId)).limit(1);
    if (!fermataScelta) return [];
    condizioni.push(eq(prenotazioni.tragittoId, fermataScelta.tragittoId), eq(prenotazioni.fermataCitta, fermataScelta.citta));
  } else if (filtro.tragittoId) {
    condizioni.push(eq(prenotazioni.tragittoId, filtro.tragittoId));
  } else if (filtro.servizioIds.length > 0) {
    const tragittiDeiServizi = await db.select({ id: tragitti.id }).from(tragitti).where(inArray(tragitti.servizioId, filtro.servizioIds));
    if (tragittiDeiServizi.length === 0) return [];
    condizioni.push(inArray(prenotazioni.tragittoId, tragittiDeiServizi.map((t) => t.id)));
  }

  const righe = await db
    .select({ utenteId: prenotazioni.utenteId, nome: utenti.nome, email: utenti.email })
    .from(prenotazioni)
    .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
    .where(and(...condizioni));

  const perUtente = new Map<string, { utenteId: string; nome: string; email: string }>();
  for (const r of righe) perUtente.set(r.utenteId, { utenteId: r.utenteId, nome: r.nome ?? '', email: r.email });
  return Array.from(perUtente.values());
}

export const comunicazioniService = {
  trovaDestinatari,

  async list(eventoId: string) {
    return db.select().from(comunicazioni).where(eq(comunicazioni.eventoId, eventoId)).orderBy(desc(comunicazioni.creataIl));
  },

  async invia(eventoId: string, input: z.infer<typeof inviaComunicazioneSchema>) {
    const destinatari = await trovaDestinatari(eventoId, input);
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, eventoId)).limit(1);
    if (!evento) throw new Error('Evento non trovato');

    for (const cliente of destinatari) {
      if (input.canali.includes('EMAIL')) {
        try {
          await inviaEmail({ a: cliente.email, oggetto: input.oggetto, html: `<p>${input.corpo.replace(/\n/g, '<br>')}</p>` });
        } catch (err) {
          console.error(`Comunicazione: email non inviata a ${cliente.email}:`, err);
        }
      }
      if (input.canali.includes('CHAT')) {
        try {
          let [conversazione] = await db.select().from(conversazioniChat)
            .where(and(eq(conversazioniChat.eventoId, eventoId), eq(conversazioniChat.clienteEmail, cliente.email))).limit(1);
          if (!conversazione) {
            [conversazione] = await db.insert(conversazioniChat).values({
              eventoId, clienteEmail: cliente.email, clienteNome: cliente.nome,
            }).returning();
          }
          await db.insert(messaggiChat).values({
            eventoId, conversazioneId: conversazione.id, autore: 'ADMIN', nome: 'INBUS',
            testo: `${input.oggetto}\n\n${input.corpo}`,
          });
          await db.update(conversazioniChat).set({ ultimoMessaggioIl: new Date() }).where(eq(conversazioniChat.id, conversazione.id));
        } catch (err) {
          console.error(`Comunicazione: messaggio chat non inviato a ${cliente.email}:`, err);
        }
      }
    }

    const [salvata] = await db.insert(comunicazioni).values({
      eventoId, oggetto: input.oggetto, corpo: input.corpo,
      filtroServizioIds: input.servizioIds, filtroTragittoId: input.tragittoId ?? null, filtroFermataId: input.fermataId ?? null,
      canali: input.canali, numeroDestinatari: destinatari.length,
    }).returning();
    return salvata;
  },
};

export const comunicazioniRouter = Router();
comunicazioniRouter.use(richiedeAuth);

comunicazioniRouter.get('/evento/:eventoId', richiedePermesso('eventi.crea'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await comunicazioniService.list(req.params.eventoId));
}));
comunicazioniRouter.get(
  '/evento/:eventoId/anteprima',
  richiedePermesso('eventi.crea'),
  asyncHandler(async (req: Request, res: Response) => {
    const filtro = filtroSchema.parse({
      servizioIds: req.query.servizioIds ? String(req.query.servizioIds).split(',').filter(Boolean) : [],
      tragittoId: req.query.tragittoId || undefined,
      fermataId: req.query.fermataId || undefined,
    });
    const destinatari = await trovaDestinatari(req.params.eventoId, filtro);
    res.json({ numeroDestinatari: destinatari.length });
  }),
);
comunicazioniRouter.post(
  '/evento/:eventoId',
  richiedePermesso('eventi.crea'),
  valida(inviaComunicazioneSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json(await comunicazioniService.invia(req.params.eventoId, req.body));
  }),
);

