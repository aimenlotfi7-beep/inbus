import { z } from 'zod';

// Il prezzo tollera anche `null` in ingresso (può arrivare così da un
// tragitto applicato che non aveva prezzo su quella fermata, es. l'arrivo)
// e lo tratta come "non impostato", invece di rifiutare la richiesta.
const prezzoFermataSchema = z.number().positive().nullable().optional().transform((v) => v ?? undefined);

const fermataSchema = z.object({
  citta: z.string().min(1),
  indirizzo: z.string().min(1),
  orario: z.string().optional(),
  orarioRitorno: z.string().optional(),
  indirizzoRitorno: z.string().optional(),
  prezzo: prezzoFermataSchema,
  // Limite posti facoltativo per questa singola fermata — se assente,
  // la fermata condivide i posti di tutto il bus (come prima).
  postiMax: z.number().int().positive().optional(),
});

const lineaSchema = z.object({
  id: z.string().optional(), // presente = tratta già esistente da aggiornare, assente = nuova
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
  // Indirizzo pubblico (es. "salmo-roma") — facoltativo: se non lo
  // scrivi, viene generato da solo dal nome dell'artista e dalla città.
  slug: z.string().regex(/^[a-z0-9-]*$/, 'Solo lettere minuscole, numeri e trattini, senza spazi.').optional(),
  genere: z.string().min(1),
  luogo: z.string().min(1),
  citta: z.string().min(1),
  data: z.coerce.date(),
  // Non più obbligatorio: i prezzi arrivano dalle fermate delle tratte.
  // Resta come riferimento/fallback interno per eventi senza tratte.
  prezzo: z.number().positive().nullable().optional().transform((v) => v ?? undefined),
  inEvidenza: z.boolean().default(false),
  ordineEvidenza: z.number().int().default(0),
  vetrinaDal: z.coerce.date().optional(),
  vetrinaAl: z.coerce.date().optional(),
  accontoEur: z.number().positive().optional(),
  statoDisponibilita: z.enum(['POCHI_POSTI', 'NUOVI_POSTI', 'ESAURITO']).nullable().optional(),
  // L'arrivo (destinazione + orario) è unico per l'evento e si applica a
  // tutte le sue tratte: è l'ancora da cui si calcolano a ritroso gli
  // orari delle fermate. I tragitti restano solo fermate+prezzo, riusabili.
  arrivoIndirizzo: z.string().optional(),
  arrivoOrario: z.string().optional(),
  visibileSito: z.boolean().default(true),
  descrizione: z.string().optional(),
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
  // Ricerca testuale libera (artista/luogo/città), usata dalla barra di
  // ricerca eventi nel gestionale (sezione Prenotazioni) e sul sito.
  ricerca: z.string().optional(),
  // Usati dal sito pubblico: nasconde eventi già passati e/o con
  // visibileSito=false. Il gestionale non li passa mai, per vedere
  // sempre tutto (comprese le tab "Eventi passati").
  soloFuturi: z.coerce.boolean().optional(),
  soloVisibili: z.coerce.boolean().optional(),
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
  tourLeaderId: z.string().optional(),
  note: z.string().optional(),
  lineeIds: z.array(z.string()).min(1),
});
export const aggiornaBusSchema = creaBusSchema.partial().extend({
  tourLeaderId: z.string().nullable().optional(),
});
