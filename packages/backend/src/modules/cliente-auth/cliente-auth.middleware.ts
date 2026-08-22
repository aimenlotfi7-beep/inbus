import type { Request, Response, NextFunction } from 'express';
import { clienteAuthService, type TokenCliente } from './cliente-auth.service.js';
import { NonAutorizzato } from '../../shared/errors.js';

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
export function richiedeAuthCliente(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new NonAutorizzato('Devi accedere al tuo account per continuare.');
  const token = header.slice('Bearer '.length);
  req.cliente = clienteAuthService.verificaToken(token);
  next();
}
