import { z } from 'zod';

const fermataSchema = z.object({
  citta: z.string().min(1),
  indirizzo: z.string().min(1),
  orario: z.string().optional(),
  orarioRitorno: z.string().optional(),
  indirizzoRitorno: z.string().optional(),
  prezzo: z.number().positive().optional(),
});

const lineaSchema = z.object({
  nome: z.string().min(1),
  postiTotali: z.number().int().positive(),
  prezzoExtra: z.number().default(0),
  referenteNome: z.string().optional(),
  referenteTelefono: z.string().optional(),
  fornitoreId: z.string().optional(),
  fermate: z.array(fermataSchema).default([]),
});

export const creaEventoSchema = z.object({
  artista: z.string().min(1),
  genere: z.string().min(1),
  luogo: z.string().min(1),
  citta: z.string().min(1),
  data: z.coerce.date(),
  prezzo: z.number().positive(),
  inEvidenza: z.boolean().default(false),
  ordineEvidenza: z.number().int().default(0),
  vetrinaDal: z.coerce.date().optional(),
  vetrinaAl: z.coerce.date().optional(),
  immagini: z.array(z.string().url()).default([]),
  allegati: z.array(z.object({ nome: z.string(), url: z.string() })).default([]),
  linee: z.array(lineaSchema).default([]),
});
export type CreaEventoInput = z.infer<typeof creaEventoSchema>;

export const aggiornaEventoSchema = creaEventoSchema.partial();
export type AggiornaEventoInput = z.infer<typeof aggiornaEventoSchema>;

export const listaEventiQuerySchema = z.object({
  citta: z.string().optional(),
  genere: z.string().optional(),
  soloInEvidenza: z.coerce.boolean().optional(),
});
export type ListaEventiQuery = z.infer<typeof listaEventiQuerySchema>;

export const impostaCoperturaSchema = z.object({
  coperta: z.boolean(),
  noteCoperta: z.string().optional(),
});

export const creaBusSchema = z.object({
  fornitoreId: z.string().optional(),
  riferimento: z.string().min(1),
  autistaNome: z.string().optional(),
  autistaTelefono: z.string().optional(),
  note: z.string().optional(),
  lineeIds: z.array(z.string()).min(1),
});
export const aggiornaBusSchema = creaBusSchema.partial();
