import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { MulterError } from 'multer';
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
  // Multer (caricamento file) ha le sue classi di errore, non
  // ErroreApplicativo — altrimenti "file troppo grande" mostrerebbe il
  // generico "Errore interno del server" invece del motivo vero.
  if (err instanceof MulterError) {
    const messaggio = err.code === 'LIMIT_FILE_SIZE' ? 'Il file supera la dimensione massima consentita (10MB).' : `Caricamento file non riuscito: ${err.message}`;
    return res.status(400).json({ errore: messaggio, codice: err.code });
  }
  console.error('Errore non gestito:', err);
  return res.status(500).json({ errore: 'Errore interno del server', codice: 'ERRORE_INTERNO' });
}
