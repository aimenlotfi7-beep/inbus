import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { NonAutorizzato, VietatoDaiPermessi } from '../../shared/errors.js';
import type { TokenPayload } from './auth.dto.js';
import { haPermesso, permessiEffettivi } from './permessi.service.js';

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

/** Da usare DOPO richiedeAuth: richiedePermesso('eventi.crea').
 *  Chi ha ruolo "owner" passa sempre, a prescindere dalla chiave. */
export function richiedePermesso(chiave: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) throw new NonAutorizzato();
    const ok = await haPermesso(req.admin.sub, chiave);
    if (!ok) throw new VietatoDaiPermessi();
    next();
  };
}

/** Da usare DOPO richiedeAuth: consente l'accesso solo a chi ha ruolo "owner". */
export function richiedeOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.admin) throw new NonAutorizzato();
  permessiEffettivi(req.admin.sub).then((eff) => {
    if (!eff.owner) return next(new VietatoDaiPermessi('Solo il proprietario può eseguire questa azione'));
    next();
  }, next);
}

// Nota: la vecchia richiedeRuolo(...) a ruoli fissi è stata rimossa: tutte
// le routes usano ora richiedePermesso('chiave.permesso'), verificato
// contro i permessi dinamici assegnati al ruolo dell'utente (vedi
// permessi.service.ts).
