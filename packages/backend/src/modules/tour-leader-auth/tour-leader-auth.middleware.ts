import type { Request, Response, NextFunction } from 'express';
import { tourLeaderAuthService, type TokenTourLeader } from './tour-leader-auth.service.js';
import { NonAutorizzato } from '../../shared/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tourLeader?: TokenTourLeader;
    }
  }
}

/** Separato apposta da richiedeAuth (quello degli amministratori): un
 *  token tour leader non deve MAI poter accedere alle route admin, e
 *  viceversa — sono due sistemi di accesso distinti, con permessi
 *  completamente diversi (un tour leader vede solo i suoi bus). */
export function richiedeAuthTourLeader(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new NonAutorizzato('Token mancante');
  const token = header.slice('Bearer '.length);
  req.tourLeader = tourLeaderAuthService.verificaToken(token);
  next();
}
