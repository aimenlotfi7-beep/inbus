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
  tragittoId: z.string().min(1),
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
  // Meta Pixel / Conversions API: eventId condiviso tra il Pixel nel
  // browser e la chiamata server-side, per la deduplica; fbp/fbc sono
  // i cookie che il Pixel imposta da solo, per il "match quality".
  metaEventId: z.string().optional(),
  metaFbp: z.string().optional(),
  metaFbc: z.string().optional(),
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

/** Il carrello — un elenco di articoli, ognuno validato con le stesse
 *  identiche regole di una prenotazione singola (min 1, max 20 per non
 *  permettere carrelli assurdi). */
export const creaOrdineSchema = z.object({
  articoli: z.array(creaPrenotazioneSchema).min(1, 'Il carrello è vuoto.').max(20, 'Troppi articoli in un unico ordine.'),
  // Se presente, l'ordine è l'acquisto di un bundle: le regole del
  // bundle (composizione, passeggeri, finestra, interruttori) vengono
  // verificate lato server in creaOrdine, e lo sconto ripartito per riga.
  bundleId: z.string().optional(),
});

/** D1(b) — stesso ordine di sopra, più l'identità di chi acquista SENZA
 *  essere loggato (altrimenti presa dalla sessione). Stessi vincoli
 *  della registrazione normale (vedi cliente-auth.routes.ts) — la data
 *  di nascita resta obbligatoria anche qui: serve al riordino
 *  automatico per fasce d'età nei bus, non è un dettaglio rimandabile
 *  solo perché si compra da ospiti. */
export const creaOrdineOspiteSchema = z.object({
  articoli: z.array(creaPrenotazioneSchema).min(1, 'Il carrello è vuoto.').max(20, 'Troppi articoli in un unico ordine.'),
  bundleId: z.string().optional(),
  email: z.string().email(),
  nome: z.string().min(1),
  cognome: z.string().min(1),
  telefono: z.string().optional(),
  citta: z.string().optional(),
  dataNascita: z.coerce.date().refine((d) => d < new Date(), 'La data di nascita non può essere nel futuro.'),
});

export const richiediRimborsoSchema = z.object({
  motivo: z.string().optional(),
});
