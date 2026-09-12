import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { clienteAuthService } from './cliente-auth.service.js';
import { richiedeAuthCliente } from './cliente-auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { db } from '../../db/client.js';
import { movimentiCredito, utenti } from '../../db/schema.js';
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
    codiceReferral: z.string().optional(),
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

/** Modifica dei propri dati — email esclusa di proposito (non è nello
 *  schema qui sotto, quindi anche se arrivasse nel corpo della
 *  richiesta verrebbe scartata prima di arrivare al service). */
clienteAuthRouter.patch(
  '/me',
  richiedeAuthCliente,
  valida(z.object({
    nome: z.string().min(1),
    cognome: z.string().min(1),
    telefono: z.string().optional(),
    citta: z.string().optional(),
    dataNascita: z.coerce.date().refine((d) => d < new Date(), 'La data di nascita non può essere nel futuro.'),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.cliente) throw new NonAutorizzato();
    await clienteAuthService.aggiornaProfilo(req.cliente.sub, req.body);
    res.json({ ok: true });
  }),
);

/** Cancellazione dell'account, richiesta dal cliente stesso — la
 *  password nel corpo della richiesta è la conferma (vedi service). */
clienteAuthRouter.post(
  '/me/elimina',
  richiedeAuthCliente,
  valida(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.cliente) throw new NonAutorizzato();
    await clienteAuthService.eliminaAccount(req.cliente.sub, req.body.password);
    res.json({ ok: true });
  }),
);

/** Il proprio credito per l'area personale: saldo e movimenti (positivi =
 *  maturati, negativi = utilizzati), dal più recente. Preso dal token.
 *  Sostituisce GET /api/credito/movimenti?email=…, tolto il 31/08/2026
 *  (leggeva lo storico di chiunque conoscendo l'email): l'area cliente lo
 *  chiamava ancora e mostrava "Nessun movimento" e totali a 0 a tutti. */
clienteAuthRouter.get('/me/credito', richiedeAuthCliente, asyncHandler(async (req: Request, res: Response) => {
  if (!req.cliente) throw new NonAutorizzato();
  const [u] = await db.select({ credito: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.id, req.cliente.sub)).limit(1);
  if (!u) throw new NonAutorizzato();
  const movimenti = await db
    .select({ id: movimentiCredito.id, importo: movimentiCredito.importo, motivo: movimentiCredito.motivo, creatoIl: movimentiCredito.creatoIl })
    .from(movimentiCredito)
    .where(eq(movimentiCredito.utenteId, req.cliente.sub))
    .orderBy(desc(movimentiCredito.creatoIl));
  res.json({ disponibile: Number(u.credito), movimenti });
}));

/** "Invita un amico" — codice personale (generato al primo utilizzo)
 *  e lo storico di chi è stato invitato: "in sospeso" (registrato, non
 *  ha ancora prenotato) o "completato" (ha prenotato, il bonus è
 *  scattato). Niente email/dati sensibili dell'amico, solo nome e
 *  stato — a chi invita basta sapere "a che punto è", non altro. */
clienteAuthRouter.get('/me/referral', richiedeAuthCliente, asyncHandler(async (req: Request, res: Response) => {
  if (!req.cliente) throw new NonAutorizzato();
  const { creditoService } = await import('../credito/credito.service.js');
  const codice = await creditoService.trovaOCreaCodiceReferral(req.cliente.sub);
  const invitati = await db.select({ nome: utenti.nome, cognome: utenti.cognome, completato: utenti.bonusReferralInvitanteErogato })
    .from(utenti).where(eq(utenti.invitatoDaUtenteId, req.cliente.sub));
  res.json({
    codice,
    invitati: invitati.map((i) => ({ nome: [i.nome, i.cognome].filter(Boolean).join(' ') || 'Un amico', completato: i.completato })),
  });
}));
