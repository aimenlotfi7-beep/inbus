import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { clienteAuthService } from './cliente-auth.service.js';
import { richiedeAuthCliente } from './cliente-auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { db } from '../../db/client.js';
import { utenti } from '../../db/schema.js';
import { NonAutorizzato } from '../../shared/errors.js';
import { limiteAutenticazione, limiteRegistrazione } from '../../shared/rateLimit.js';

export const clienteAuthRouter = Router();

clienteAuthRouter.post(
  '/registrati',
  limiteRegistrazione,
  valida(z.object({
    email: z.string().email(),
    password: z.string().min(8, 'La password deve avere almeno 8 caratteri.'),
    nome: z.string().min(1),
    cognome: z.string().min(1),
    telefono: z.string().optional(),
    citta: z.string().optional(),
    // Obbligatoria (non facoltativa come gli altri campi qui sopra):
    // serve al riordino automatico per fasce d'età nei bus (vedi
    // Linee) — senza, un account non potrebbe mai essere ordinato
    // correttamente insieme agli altri. Presa dal titolare
    // dell'account, non dai singoli partecipanti di ogni prenotazione
    // (che possono avere età diverse — un genitore con figli minorenni,
    // ad esempio) — il gruppo segue sempre l'età di chi ha prenotato.
    dataNascita: z.coerce.date().refine((d) => d < new Date(), 'La data di nascita non può essere nel futuro.'),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    await clienteAuthService.registrati(req.body);
    res.json({ ok: true });
  }),
);

clienteAuthRouter.get('/verifica/:token', asyncHandler(async (req: Request, res: Response) => {
  const { token } = await clienteAuthService.verificaEmail(req.params.token);
  res.json({ token });
}));

clienteAuthRouter.post(
  '/login',
  limiteAutenticazione,
  valida(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = await clienteAuthService.login(req.body.email, req.body.password);
    res.json({ token });
  }),
);

clienteAuthRouter.post(
  '/rimanda-verifica',
  limiteAutenticazione,
  valida(z.object({ email: z.string().email() })),
  asyncHandler(async (req: Request, res: Response) => {
    await clienteAuthService.rimandaVerifica(req.body.email);
    res.json({ ok: true }); // sempre ok, anche se l'email non esiste — non si scopre nulla dal fuori
  }),
);

clienteAuthRouter.post(
  '/richiedi-reset',
  limiteAutenticazione,
  valida(z.object({ email: z.string().email() })),
  asyncHandler(async (req: Request, res: Response) => {
    await clienteAuthService.richiediResetPassword(req.body.email);
    res.json({ ok: true }); // sempre ok — stesso motivo di sopra
  }),
);
clienteAuthRouter.post(
  '/reset-password',
  limiteAutenticazione,
  valida(z.object({ token: z.string(), password: z.string().min(8, 'La password deve avere almeno 8 caratteri.') })),
  asyncHandler(async (req: Request, res: Response) => {
    await clienteAuthService.confermaResetPassword(req.body.token, req.body.password);
    res.json({ ok: true });
  }),
);

/** I propri dati, per l'area personale — presi dal token, mai da un
 *  parametro passato dal browser (altrimenti chiunque potrebbe vedere i
 *  dati di un altro cambiando l'indirizzo). */
clienteAuthRouter.get('/me', richiedeAuthCliente, asyncHandler(async (req: Request, res: Response) => {
  if (!req.cliente) throw new NonAutorizzato();
  const [u] = await db.select().from(utenti).where(eq(utenti.id, req.cliente.sub)).limit(1);
  if (!u) throw new NonAutorizzato();
  const { passwordHash, tokenVerificaEmail, ...datiPubblici } = u;
  res.json(datiPubblici);
}));
