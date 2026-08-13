import { z } from 'zod';

export const clienteCheckoutSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1),
  cognome: z.string().optional(),
  telefono: z.string().optional(),
});

export const creaPrenotazioneSchema = z.object({
  eventoId: z.string().min(1),
  lineaId: z.string().min(1),
  fermataId: z.string().min(1),
  passeggeri: z.number().int().min(1).max(20),
  tipoPagamento: z.enum(['COMPLETO', 'ACCONTO']).default('COMPLETO'),
  metodoPagamento: z.enum(['CARTA', 'PAYPAL', 'SATISPAY', 'DA_CONCORDARE']).default('CARTA'),
  couponCodice: z.string().optional(),
  promoterCodice: z.string().optional(),
  cliente: clienteCheckoutSchema,
});
export type CreaPrenotazioneInput = z.infer<typeof creaPrenotazioneSchema>;

export const richiediRimborsoSchema = z.object({
  motivo: z.string().optional(),
});
