import { z } from 'zod';

// Il prezzo tollera anche `null` in ingresso (può arrivare così da un
// tragitto applicato che non aveva prezzo su quella fermata, es. l'arrivo)
// e lo tratta come "non impostato", invece di rifiutare la richiesta.
const prezzoFermataSchema = z.number().positive().nullable().optional().transform((v) => v ?? undefined);

const fermataSchema = z.object({
  // Da quale voce dell'anagrafica arriva — facoltativo, resta possibile
  // scrivere una fermata al volo senza passare dall'anagrafica.
  fermataAnagraficaId: z.string().nullable().optional(),
  citta: z.string().min(1),
  indirizzo: z.string().min(1),
  orario: z.string().optional(),
  orarioRitorno: z.string().optional(),
  indirizzoRitorno: z.string().optional(),
  prezzo: prezzoFermataSchema,
  // Limite posti facoltativo per questa singola fermata — se assente,
  // la fermata condivide i posti di tutto il bus (come prima).
  postiMax: z.number().int().positive().optional(),
  // Soglia minima (facoltativa su OGNI fermata) + disattivabile
  // singolarmente — le fermate vengono cancellate e ricreate a ogni
  // salvataggio (sia da Eventi che da Partenze): questi campi DEVONO
  // essere qui, altrimenti andrebbero persi ogni volta.
  sogliaMinima: z.number().int().positive().nullable().optional(),
  attivo: z.boolean().default(true),
});

export const tragittoSchema = z.object({
  id: z.string().optional(), // presente = tratta già esistente da aggiornare, assente = nuova
  servizioId: z.string().nullable().optional(), // vuoto/assente = tratta "libera", non appartiene a nessun servizio
  nome: z.string().min(1),
  postiTotali: z.number().int().positive(),
  prezzoExtra: z.number().default(0),
  attivo: z.boolean().default(true),
  referenteNome: z.string().optional(),
  referenteTelefono: z.string().optional(),
  fornitoreId: z.string().optional(),
  // Deciso qui, in Eventi — non più da Partenze.
  arrivoIndirizzo: z.string().optional(),
  arrivoOrario: z.string().optional(),
  arrivoCitta: z.string().optional(),
  fermate: z.array(fermataSchema).default([]),
}).refine(
  // Non ha senso la stessa fermata dell'anagrafica due volte nello
  // stesso tragitto — stesso controllo già applicato nel menu a
  // tendina in Eventi (disabilita l'opzione già usata), qui ripetuto
  // come sicurezza in più a livello di salvataggio, nel caso arrivi
  // comunque un doppione da altrove.
  (t) => {
    const idUsati = t.fermate.map((f) => f.fermataAnagraficaId).filter((id): id is string => !!id);
    return new Set(idUsati).size === idUsati.length;
  },
  { message: 'Questo tragitto usa la stessa fermata dell\'anagrafica più di una volta.', path: ['fermate'] }
);

// Un "servizio" raggruppa tragitti (tratte) — per gli eventi che
// vendono più pacchetti bus distinti nello stesso evento (es. "arrivo
// alle 14:00" e "arrivo alle 18:00"). Annidato dentro lo stesso
// payload dell'evento, come i tragitti liberi: si può creare tutto
// insieme, anche alla primissima creazione dell'evento, senza dover
// prima salvare e poi tornare a modificare.
const servizioSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(1),
  tragitti: z.array(tragittoSchema).default([]),
});

const creaEventoBase = z.object({
  artista: z.string().min(1),
  // Indirizzo pubblico (es. "salmo-roma") — facoltativo: se non lo
  // scrivi, viene generato da solo dal nome dell'artista e dalla città.
  slug: z.string().regex(/^[a-z0-9-]*$/, 'Solo lettere minuscole, numeri e trattini, senza spazi.').optional(),
  genere: z.string().min(1),
  categoria: z.string().nullable().optional(),
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
  visibileSito: z.boolean().default(true),
  bozza: z.boolean().optional(),
  descrizione: z.string().optional(),
  descrizioneSeo: z.string().optional(),
  cosaIncluso: z.string().optional(),
  requisitiNote: z.string().optional(),
  ticketColoreAccento: z.string().optional(),
  ticketImmagineSfondoUrl: z.string().optional(),
  layoutBigliettoId: z.string().nullable().optional(),
  immagini: z.array(z.string().url()).default([]),
  allegati: z.array(z.object({ nome: z.string(), url: z.string() })).default([]),
  tragitti: z.array(tragittoSchema).default([]),
  servizi: z.array(servizioSchema).default([]),
});

/** Invariante di business, applicata QUI (lato server) e non solo nel
 *  form: un evento ha UNA sola città di arrivo. Tutti i tragitti che ne
 *  hanno una scritta — liberi o dentro un servizio — devono concordare
 *  (senza distinzione di maiuscole/spazi). Il form blocca il campo, ma
 *  il form è UX: la regola vera vive qui, così vale per qualunque
 *  client e per qualunque bug futuro in un'altra schermata. */
function verificaUnicaCittaArrivo(
  dati: { tragitti?: z.infer<typeof tragittoSchema>[]; servizi?: z.infer<typeof servizioSchema>[] },
  ctx: z.RefinementCtx,
) {
  const tutti = [...(dati.tragitti ?? []), ...(dati.servizi ?? []).flatMap((s) => s.tragitti)];
  const conCitta = tutti.filter((t) => t.arrivoCitta?.trim());
  if (conCitta.length < 2) return;
  const norm = (c: string) => c.trim().toLowerCase();
  const riferimento = conCitta[0];
  const divergente = conCitta.find((t) => norm(t.arrivoCitta!) !== norm(riferimento.arrivoCitta!));
  if (divergente) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Un evento ha una sola città di arrivo: "${riferimento.nome}" arriva a "${riferimento.arrivoCitta}", "${divergente.nome}" a "${divergente.arrivoCitta}".`,
      path: ['tragitti'],
    });
  }
}

/** Solo in CREAZIONE: non si può programmare un evento nel passato.
 *  In MODIFICA non si applica — un evento già passato deve restare
 *  modificabile (correggere un refuso, un dato per lo storico), senza
 *  che la sua data ormai passata blocchi il salvataggio. */
function verificaDataNonPassata(d: { data?: Date }, ctx: z.RefinementCtx) {
  if (!d.data) return;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  if (d.data < oggi) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'La data dell\'evento non può essere nel passato.' });
  }
}

export const creaEventoSchema = creaEventoBase.superRefine(verificaUnicaCittaArrivo).superRefine(verificaDataNonPassata);
export type CreaEventoInput = z.infer<typeof creaEventoSchema>;

export const aggiornaEventoSchema = creaEventoBase.partial().superRefine(verificaUnicaCittaArrivo);
export type AggiornaEventoInput = z.infer<typeof aggiornaEventoSchema>;

export const listaEventiQuerySchema = z.object({
  citta: z.string().optional(),
  genere: z.string().optional(),
  categoria: z.string().optional(),
  soloInEvidenza: z.coerce.boolean().optional(),
  // Ricerca testuale libera (artista/luogo/città), usata dalla barra di
  // ricerca eventi nel gestionale (sezione Prenotazioni) e sul sito.
  ricerca: z.string().optional(),
  // Usati dal sito pubblico: nasconde eventi già passati e/o con
  // visibileSito=false. Il gestionale non li passa mai, per vedere
  // sempre tutto (comprese le tab "Eventi passati").
  soloFuturi: z.coerce.boolean().optional(),
  soloVisibili: z.coerce.boolean().optional(),
  // Solo la home: toglie dall'elenco gli eventi che appartengono a un
  // Tour attivo, e ci mette al loro posto una card sola per il Tour —
  // MAI passato da nessun altro chiamante (gestionale, sitemap,
  // prerender), che devono continuare a vedere ogni evento singolo
  // esattamente come oggi.
  escludiEventiInTour: z.coerce.boolean().optional(),
});
export type ListaEventiQuery = z.infer<typeof listaEventiQuerySchema>;

// Le Linee — un contenitore (percorso: quali fermate copre, in che
// ordine) che può avere uno o più bus dentro.
export const creaLineaSchema = z.object({
  fornitoreId: z.string().optional(),
  riferimento: z.string().min(1),
  autistaNome: z.string().optional(),
  autistaTelefono: z.string().optional(),
  tourLeaderId: z.string().optional(),
  costo: z.number().nonnegative().optional(),
  postiBus: z.number().int().positive(),
  note: z.string().optional(),
  fermateIds: z.array(z.string()).min(1),
});
// Aggiungere un bus a una Linea esistente — stesse fermate della
// Linea, non si ridefiniscono qui.
export const aggiungiBusALineaSchema = creaLineaSchema.omit({ fermateIds: true });
// Modificare i dati di un singolo bus dentro una Linea — mai le
// fermate (quelle sono della Linea intera, si cambiano con l'altro
// endpoint sotto).
export const aggiornaBusDiLineaSchema = creaLineaSchema.omit({ fermateIds: true }).partial().extend({
  tourLeaderId: z.string().nullable().optional(),
});
export const aggiornaPercorsoLineaSchema = z.object({
  fermateIds: z.array(z.string()).min(1),
});

// Fase 2 della revisione architetturale: orario/prezzo/posti per
// fermata e per tragitto si modificano ora da Partenze, non più da
// Eventi (che tiene solo la struttura universale: nome + sequenza
// fermate). Schema volutamente più snello di tragittoSchema — niente
// nome (fisso, si cambia solo in Eventi) né servizioId (non si sposta
// un tragitto da un servizio all'altro da qui). Niente più nemmeno
// postiTotali: non si scrive più a mano, si ricalcola da solo dalla
// somma dei bus veri registrati (vedi ricalcolaPostiTragitto).
export const aggiornaTragittoOperativoSchema = z.object({
  prezzoExtra: z.number().default(0),
  fermate: z.array(fermataSchema).default([]),
}).refine(
  (t) => {
    const idUsati = t.fermate.map((f) => f.fermataAnagraficaId).filter((id): id is string => !!id);
    return new Set(idUsati).size === idUsati.length;
  },
  { message: 'Questo tragitto usa la stessa fermata dell\'anagrafica più di una volta.', path: ['fermate'] }
);

// Fase "Prezzato": il preventivo (dal fornitore, sullo scenario più
// caro — dalla fermata più lontana) sblocca la vendita SENZA ancora un
// bus vero opzionato. I prezzi per fermata arrivano già calcolati dal
// frontend (modello pareggio al 50% + distanza dall'arrivo, richiede
// geocodifica — più naturale farla lì, stesso posto che già calcola
// gli orari dall'arrivo) — qui si limita a salvarli.
// Sezione PREVENTIVI: registra il costo del bus (fornitore+file
// facoltativi) — non tocca i prezzi di vendita per fermata, quelli
// sono un passo successivo (sezione Prezzi, quando il costo è già noto).
export const registraPreventivoManualeSchema = z.object({
  preventivoCosto: z.number().positive(),
  preventivoPostiBus: z.number().int().positive(),
  // Facoltativo — ma se manca, dopo non si sa più da chi è arrivato
  // questo prezzo (vedi conversazione: "devo censire comunque il
  // preventivo e indicare da quale fornitore deriva").
  fornitoreId: z.string().optional(),
  // Facoltativo — un file allegato anche per un inserimento manuale
  // (non solo per chi risponde tramite il link email), come richiesto.
  fileNome: z.string().max(200).optional(),
  // Stesso limite per allegato del modulo preventivi (8MB).
  fileContenuto: z.string().max(8 * 1024 * 1024 * 4 / 3, 'Il file supera gli 8MB consentiti.').optional(), // base64
});

// Sezione PREZZI: i prezzi di vendita per fermata, calcolati da un
// costo GIÀ noto (impostato in Preventivi) — non tocca fornitore/costo.
export const calcolaPrezziVenditaSchema = z.object({
  prezziPerFermata: z.array(z.object({
    fermataId: z.string(),
    prezzo: z.number().nonnegative(),
  })),
});
