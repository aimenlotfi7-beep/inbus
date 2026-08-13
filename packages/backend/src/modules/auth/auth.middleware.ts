import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { NonAutorizzato, VietatoDaiPermessi } from '../../shared/errors.js';
import type { TokenPayload } from './auth.dto.js';

// Estendo il tipo Request di Express così req.admin è tipizzato ovunque
// nell'app, invece di dover fare cast manuali in ogni controller.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: TokenPayload;
    }
  }
}

export function richiedeAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new NonAutorizzato('Token mancante');
  }
  const token = header.slice('Bearer '.length);
  req.admin = authService.verificaToken(token);
  next();
}

/** Da usare DOPO richiedeAuth: richiedeRuolo('AMMINISTRATORE', 'OPERATORE') */
export function richiedeRuolo(...ruoli: TokenPayload['ruolo'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin || !ruoli.includes(req.admin.ruolo)) {
      throw new VietatoDaiPermessi();
    }
    next();
  };
}
