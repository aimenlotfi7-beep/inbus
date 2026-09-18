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

/** Per le letture pubbliche che al gestionale mostrano qualcosa in più:
 *  con il token di un'utenza attiva imposta req.admin, altrimenti prosegue
 *  come richiesta pubblica. Mai 401: un token scaduto rimasto nel browser
 *  non deve rompere il sito. */
export async function authFacoltativa(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const dati = authService.verificaToken(header.slice('Bearer '.length));
      const eff = await permessiEffettivi(dati.sub);
      if (eff.owner || eff.permessi.size > 0) req.admin = dati;
    } catch {
      // token non valido o di un altro tipo: richiesta pubblica
    }
  }
  next();
}

/** Da usare DOPO richiedeAuth: richiedePermesso('eventi.crea').
 *  Chi ha ruolo "owner" passa sempre, a prescindere dalla chiave.
 *  Il rifiuto passa da next(): Express 4 non raccoglie gli errori lanciati
 *  da un middleware async, e prima la richiesta restava appesa e l'errore
 *  non gestito poteva fermare il server (trovato dai test automatici). */
export function richiedePermesso(chiave: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(new NonAutorizzato());
    haPermesso(req.admin.sub, chiave).then((ok) => next(ok ? undefined : new VietatoDaiPermessi()), next);
  };
}

/** Da usare DOPO richiedeAuth: chiude una funzione ai collaboratori con
 *  "solo gli eventi assegnati" anche quando il permesso che la regola lo
 *  avrebbero (lista d'attesa e comunicazioni stanno sotto i permessi degli
 *  eventi). Proprietario, settembre 2026: il collaboratore fa la parte
 *  operativa, clienti e vendite li gestisce il team OnWay. */
export function nonPerCollaboratori(req: Request, _res: Response, next: NextFunction) {
  if (!req.admin) return next(new NonAutorizzato());
  permessiEffettivi(req.admin.sub).then((eff) => {
    next(eff.soloEventiAssegnati ? new VietatoDaiPermessi('Questa parte la gestisce il team OnWay') : undefined);
  }, next);
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
