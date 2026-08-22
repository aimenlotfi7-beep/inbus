import { z } from 'zod';

export const clienteCheckoutSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1),
  cognome: z.string().min(1),
  telefono: z.string().min(4),
});

const partecipanteSchema = z.object({
  nome: z.string().min(1),
  cognome: z.string().min(1),
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
  // Solo per pagamento COMPLETO (non si applica all'acconto, per non
  // complicare il calcolo del saldo residuo) — usa TUTTO il credito
  // disponibile del cliente fino a coprire il totale, mai di più.
  usaCredito: z.boolean().optional(),
  // Marketing: se la prenotazione arriva da un link con offerta dedicata
  // e/o da una campagna tracciata (facoltativi, indipendenti tra loro).
  offertaId: z.string().optional(),
  campagnaId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  cliente: clienteCheckoutSchema,
  // Un modulo nome+cognome per ogni passeggero OLTRE al richiedente
  // (che è già coperto da "cliente" qui sopra) — quindi deve essere
  // lungo esattamente passeggeri-1.
  partecipanti: z.array(partecipanteSchema).default([]),
}).refine(
  (v) => v.partecipanti.length === v.passeggeri - 1,
  { message: 'Il numero di partecipanti aggiuntivi deve essere passeggeri-1 (il richiedente conta come primo passeggero).', path: ['partecipanti'] }
);
export type CreaPrenotazioneInput = z.infer<typeof creaPrenotazioneSchema>;

export const richiediRimborsoSchema = z.object({
  motivo: z.string().optional(),
});
