import { z } from 'zod';

export const creaCouponSchema = z.object({
  codice: z.string().min(3).transform((v) => v.toUpperCase()),
  tipo: z.enum(['PERCENTUALE', 'FISSO']),
  valore: z.number().positive(),
  usiMax: z.number().int().positive().optional(),
  validoDal: z.coerce.date().optional(),
  validoAl: z.coerce.date().optional(),
  attivo: z.boolean().default(true),
  // Vuoto/assente = valido su tutti gli eventi.
  eventoId: z.string().nullable().optional(),
  // Se impostato, usare questo coupon attribuisce la vendita anche a
  // questo promoter — sconto al cliente e commissione al promoter
  // insieme, con un solo codice.
  promoterId: z.string().nullable().optional(),
  // Compenso PER QUESTO CODICE — se assente, si usa il tasso di
  // default dell'account del promoter. Rilevante solo se promoterId è
  // impostato; compensoFissoPer solo se compensoTipo è FISSO.
  compensoTipo: z.enum(['PERCENTUALE', 'FISSO']).nullable().optional(),
  compensoValore: z.number().positive().nullable().optional(),
  compensoFissoPer: z.enum(['ACQUISTO', 'PASSEGGERO']).nullable().optional(),
});
export type CreaCouponInput = z.infer<typeof creaCouponSchema>;
export const aggiornaCouponSchema = creaCouponSchema.partial();
