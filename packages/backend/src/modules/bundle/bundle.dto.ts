import { z } from 'zod';

/** Regole di CONFIGURAZIONE (l'admin che crea/modifica) — lato server,
 *  non solo nel form. Le regole di ACQUISTO (il cliente) sono in
 *  bundle-regole.ts. */
const bundleBase = z.object({
  nome: z.string().min(1, 'Il nome è obbligatorio.'),
  slug: z.string().optional(),
  descrizione: z.string().nullable().optional(),
  copertinaUrl: z.string().nullable().optional(),
  tipo: z.enum(['FISSO', 'LIBERO']),
  eventiIds: z.array(z.string()).min(1, 'Scegli almeno un evento.'),
  minEventi: z.number().int().positive().nullable().optional(),
  maxEventi: z.number().int().positive().nullable().optional(),
  minPosti: z.number().int().positive().default(1),
  maxPosti: z.number().int().positive().default(10),
  scontoPercentuale: z.number().gt(0, 'Lo sconto deve essere maggiore di 0.').lt(100, 'Lo sconto deve essere minore di 100.'),
  ammetteOfferte: z.boolean().default(false),
  ammetteCredito: z.boolean().default(false),
  ammettePromoter: z.boolean().default(false),
  ammetteAcconto: z.boolean().default(false),
  inizioVendita: z.coerce.date().nullable().optional(),
  fineVendita: z.coerce.date().nullable().optional(),
  visibileSeProgrammato: z.boolean().default(true),
  visibileSeTerminato: z.boolean().default(false),
  attivo: z.boolean().default(true),
  inEvidenzaHome: z.boolean().default(false),
  organizzatoreId: z.string().nullable().optional(),
});

function verificaRegoleBundle(d: z.infer<typeof bundleBase>, ctx: z.RefinementCtx) {
  if (new Set(d.eventiIds).size !== d.eventiIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventiIds'], message: 'Un evento è stato scelto due volte.' });
  if (d.tipo === 'LIBERO') {
    const min = d.minEventi ?? 0;
    if (min < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minEventi'], message: 'Per un bundle libero indica quanti eventi minimo deve scegliere il cliente.' });
    if (min > d.eventiIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minEventi'], message: `Il minimo (${min}) supera gli eventi disponibili (${d.eventiIds.length}).` });
    if (d.maxEventi != null && d.maxEventi < min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxEventi'], message: 'Il massimo non può essere minore del minimo.' });
    if (d.maxEventi != null && d.maxEventi > d.eventiIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxEventi'], message: 'Il massimo supera gli eventi disponibili.' });
  }
  if (d.maxPosti < d.minPosti) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxPosti'], message: 'I posti massimi non possono essere meno dei minimi.' });
  if (d.inizioVendita && d.fineVendita && d.fineVendita.getTime() <= d.inizioVendita.getTime()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fineVendita'], message: 'La fine vendita deve essere dopo l\'inizio.' });
  if ((d.inizioVendita && !d.fineVendita) || (!d.inizioVendita && d.fineVendita)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fineVendita'], message: 'Indica sia inizio sia fine vendita (o nessuno dei due per lasciarlo in bozza).' });
}

export const creaBundleSchema = bundleBase.superRefine(verificaRegoleBundle);
export const aggiornaBundleSchema = bundleBase.superRefine(verificaRegoleBundle);
export type BundleInput = z.infer<typeof creaBundleSchema>;
