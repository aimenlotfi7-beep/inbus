import { z } from 'zod';

export const creaTourSchema = z.object({
  nome: z.string().min(1, 'Il nome è obbligatorio.'),
  slug: z.string().optional(),
  copertinaUrl: z.string().nullable().optional(),
  descrizione: z.string().nullable().optional(),
  descrizioneSeo: z.string().nullable().optional(),
  eventiIds: z.array(z.string()).min(1, 'Scegli almeno un evento.'),
}).superRefine((d, ctx) => {
  if (new Set(d.eventiIds).size !== d.eventiIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventiIds'], message: 'Un evento è stato scelto due volte.' });
  }
});
export const aggiornaTourSchema = creaTourSchema;
export type TourInput = z.infer<typeof creaTourSchema>;
