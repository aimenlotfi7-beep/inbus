import type { Request, Response, NextFunction } from 'express';
import { clienteAuthService, type TokenCliente } from './cliente-auth.service.js';
import { NonAutorizzato } from '../../shared/errors.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { utenti } from '../../db/schema.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      cliente?: TokenCliente;
    }
  }
}

/** Separato da richiedeAuth (admin) e richiedeAuthTourLeader — tre
 *  sistemi di accesso distinti, un token di uno non funziona mai per
 *  gli altri due. */
export async function richiedeAuthCliente(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new NonAutorizzato('Devi accedere al tuo account per continuare.');
    const token = header.slice('Bearer '.length);
    const dati = clienteAuthService.verificaToken(token);
    // Il token vale 30 giorni: un profilo eliminato nel frattempo (da un
    // altro dispositivo) non deve poter continuare a prenotare o leggere dati.
    const [u] = await db.select({ eliminatoIl: utenti.eliminatoIl }).from(utenti).where(eq(utenti.id, dati.sub)).limit(1);
    if (!u || u.eliminatoIl) throw new NonAutorizzato('Questo account non è più attivo.');
    req.cliente = dati;
    next();
  } catch (err) {
    next(err);
  }
}
