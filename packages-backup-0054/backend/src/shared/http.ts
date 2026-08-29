import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ErroreApplicativo } from './errors.js';

/** Avvolge un controller async: se lancia un errore, lo passa a next() invece
 *  di far crashare il processo (Express 4 non gestisce da solo le Promise). */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Middleware finale: unico punto in cui si decide come rispondere in caso
 *  di errore. Gli errori "conosciuti" (ErroreApplicativo) mostrano il loro
 *  messaggio; tutto il resto viene loggato e nascosto al client. */
export function gestoreErrori(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ErroreApplicativo) {
    return res.status(err.statusCode).json({ errore: err.message, codice: err.code });
  }
  console.error('Errore non gestito:', err);
  return res.status(500).json({ errore: 'Errore interno del server', codice: 'ERRORE_INTERNO' });
}
