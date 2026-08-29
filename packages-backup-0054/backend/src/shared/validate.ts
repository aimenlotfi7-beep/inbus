import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ErroreApplicativo } from './errors.js';

type Sorgente = 'body' | 'query' | 'params';

/**
 * Middleware generico: valida req[sorgente] con lo schema zod passato.
 * Se non valido, risponde 400 con l'elenco dei campi sbagliati.
 * Se valido, sovrascrive req[sorgente] con i dati "puliti" (con i default
 * applicati), così i controller ricevono sempre dati già corretti.
 */
export function valida(schema: ZodSchema, sorgente: Sorgente = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const risultato = schema.safeParse(req[sorgente]);
    if (!risultato.success) {
      throw new ErroreApplicativo(
        'Dati non validi: ' + JSON.stringify(risultato.error.flatten().fieldErrors),
        400,
        'VALIDAZIONE_FALLITA'
      );
    }
    (req as any)[sorgente] = risultato.data;
    next();
  };
}
