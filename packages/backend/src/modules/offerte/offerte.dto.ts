import { z } from 'zod';

export const creaOffertaSchema = z.object({
  eventoId: z.string().min(1),
  campagnaId: z.string().optional(),
  nome: z.string().min(1),
  // Solo lettere minuscole, numeri e trattini — diventa parte dell'URL
  // pubblico (es. /offerta/salmo-meta-retarget).
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Solo lettere minuscole, numeri e trattini, senza spazi.'),
  // Percentuale di sconto (es. 20 = -20%), applicata al prezzo normale
  // di qualunque fermata scelga il cliente — non un prezzo fisso.
  scontoPercentuale: z.number().positive().max(100),
  attiva: z.boolean().default(true),
  // nullable: con null z.coerce.date() darebbe 01/01/1970 (vedi coupon.dto.ts)
  validoDal: z.coerce.date().nullable().optional(),
  validoAl: z.coerce.date().nullable().optional(),
  limiteUtilizzi: z.number().int().positive().optional(),
});
export type CreaOffertaInput = z.infer<typeof creaOffertaSchema>;

export const aggiornaOffertaSchema = creaOffertaSchema.partial().omit({ eventoId: true });
