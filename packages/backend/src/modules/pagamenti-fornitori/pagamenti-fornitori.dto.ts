import { z } from 'zod';

/** Dati accettati dalla sezione "Pagamenti fornitori". Gli importi sono
 *  in euro (numeri, non testo) e le date arrivano come testo ISO dal
 *  gestionale: z.coerce.date() le trasforma qui una volta sola. */

const dataOpzionale = z.coerce.date().nullable().optional();
const testoOpzionale = (max: number) => z.string().trim().max(max).nullable().optional();

export const creaSpesaSchema = z.object({
  fornitoreId: z.string().min(1, 'Scegli il fornitore.'),
  eventoId: z.string().min(1).nullable().optional(),
  descrizione: z.string().trim().min(1, 'Scrivi a cosa si riferisce la spesa.').max(300),
  importo: z.number().positive('L\'importo deve essere maggiore di zero.').max(1_000_000),
  numeroFattura: testoOpzionale(100),
  dataFattura: dataOpzionale,
  scadenza: dataOpzionale,
  fatturaUrl: testoOpzionale(2000),
  note: testoOpzionale(4000),
});

export const aggiornaSpesaSchema = creaSpesaSchema
  .omit({ fornitoreId: true })
  .partial()
  .extend({ annullata: z.boolean().optional() });

export const pagamentoSchema = z.object({
  importo: z.number().positive('L\'importo deve essere maggiore di zero.').max(1_000_000),
  pagatoIl: z.coerce.date(),
  metodo: z.enum(['BONIFICO', 'CONTANTI', 'CARTA', 'ALTRO']).default('BONIFICO'),
  riferimento: testoOpzionale(200),
  note: testoOpzionale(2000),
});

export const filtriSpeseSchema = z.object({
  stato: z.enum(['DA_PAGARE', 'PARZIALE', 'PAGATA', 'ANNULLATA', 'SCADUTE']).optional(),
  fornitoreId: z.string().min(1).optional(),
  eventoId: z.string().min(1).optional(),
  dal: z.coerce.date().optional(),
  al: z.coerce.date().optional(),
  testo: z.string().trim().max(200).optional(),
});

export type CreaSpesaInput = z.infer<typeof creaSpesaSchema>;
export type AggiornaSpesaInput = z.infer<typeof aggiornaSpesaSchema>;
export type PagamentoInput = z.infer<typeof pagamentoSchema>;
export type FiltriSpeseInput = z.infer<typeof filtriSpeseSchema>;
