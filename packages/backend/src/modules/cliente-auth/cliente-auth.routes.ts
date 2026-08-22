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

export const clienteAuthRouter = Router();

clienteAuthRouter.post(
  '/registrati',
  valida(z.object({
    email: z.string().email(),
    password: z.string().min(8, 'La password deve avere almeno 8 caratteri.'),
    nome: z.string().min(1),
    cognome: z.string().min(1),
    telefono: z.string().optional(),
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
  valida(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = await clienteAuthService.login(req.body.email, req.body.password);
    res.json({ token });
  }),
);

clienteAuthRouter.post(
  '/rimanda-verifica',
  valida(z.object({ email: z.string().email() })),
  asyncHandler(async (req: Request, res: Response) => {
    await clienteAuthService.rimandaVerifica(req.body.email);
    res.json({ ok: true }); // sempre ok, anche se l'email non esiste — non si scopre nulla dal fuori
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
