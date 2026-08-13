import { z } from 'zod';

export const creaCouponSchema = z.object({
  codice: z.string().min(3).transform((v) => v.toUpperCase()),
  tipo: z.enum(['PERCENTUALE', 'FISSO']),
  valore: z.number().positive(),
  usiMax: z.number().int().positive().optional(),
  validoDal: z.coerce.date().optional(),
  validoAl: z.coerce.date().optional(),
  attivo: z.boolean().default(true),
});
export type CreaCouponInput = z.infer<typeof creaCouponSchema>;
export const aggiornaCouponSchema = creaCouponSchema.partial();
