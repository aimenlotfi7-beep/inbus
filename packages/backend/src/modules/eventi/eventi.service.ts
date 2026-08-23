import { and, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  eventi,
  lineeBus,
  prodotti,
  fermate,
  immaginiEvento,
  allegatiEvento,
  prenotazioni,
  busFisici,
  busTratte,
  tourLeader,
  utenti,
  partecipantiPrenotazione,
} from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { prezzoNormaleFermata } from '../../shared/prezzi.js';
import { leggiPostiPerBus } from '../impostazioni/impostazioni.routes.js';
import type { CreaEventoInput, AggiornaEventoInput, ListaEventiQuery } from './eventi.dto.js';
import { lineaSchema } from './eventi.dto.js';
import type { z } from 'zod';

// Include standard riusato da list/getById: evento con tutte le sue
// relazioni annidate, così il frontend riceve un unico oggetto completo
// (esattamente come faceva il vecchio inbusLoadDB() nel prototipo).
export const includeCompleto = {
  // Nascoste ovunque venga usata questa query condivisa (form di
  // modifica, sito pubblico, checkout) — restano recuperabili solo
  // tramite le funzioni dedicate del Cestino qui sotto.
  linee: { where: isNull(lineeBus.eliminatoIl), with: { fermate: true } },
  // I prodotti (se l'evento ne ha) — ognuno con le proprie tratte. Un
  // evento senza nessun prodotto (il caso normale) ha semplicemente un
  // array vuoto qui: tutto continua a funzionare come prima.
  prodotti: { with: { linee: { where: isNull(lineeBus.eliminatoIl), with: { fermate: true } } } },
  immagini: true,
  allegati: true,
} as const;

async function getById(id: string) {
  const evento = await db.query.eventi.findFirst({
    where: eq(eventi.id, id),
    with: includeCompleto,
  });
  if (!evento) throw new NonTrovato('Evento');
  return evento;
}

/** Genera uno slug leggibile e univoco (es. "salmo-roma", o
 *  "salmo-roma-2" se già in uso) — usato quando non ne arriva uno
 *  esplicito dal gestionale, o come base se quello scelto è già preso. */
async function generaSlugUnivoco(base: string, idDaEscludere?: string) {
  const pulito = base
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // toglie accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'evento';

  let candidato = pulito;
  let tentativo = 1;
  while (true) {
    const condizione = idDaEscludere
      ? and(eq(eventi.slug, candidato), sql`${eventi.id} != ${idDaEscludere}`)
      : eq(eventi.slug, candidato);
    const [esistente] = await db.select({ id: eventi.id }).from(eventi).where(condizione).limit(1);
    if (!esistente) return candidato;
    tentativo++;
    candidato = `${pulito}-${tentativo}`;
  }
}

/** Calcola in automatico "pochi posti / esaurito" dai numeri veri
 *  dell'evento (somma posti totali e disponibili su tutte le tratte) —
 *  usata SOLO quando l'amministratore non ha impostato nulla a mano
 *  (statoDisponibilita è vuoto). Se l'ha impostato lui, quella scelta
 *  vince sempre, anche se i numeri reali direbbero altro (es. per una
 *  promozione "posti quasi finiti" anche se in realtà ce ne sono
 *  ancora). "Nuovi posti disponibili" non ha un innesco automatico
 *  sensato (richiederebbe tener traccia della storia, non solo dello
 *  stato attuale) — resta un'etichetta solo manuale. */
function calcolaStatoAutomatico(linee: { postiTotali: number; postiDisponibili: number }[]): 'POCHI_POSTI' | 'ESAURITO' | null {
  if (linee.length === 0) return null;
  const totale = linee.reduce((s, l) => s + l.postiTotali, 0);
  const disponibili = linee.reduce((s, l) => s + l.postiDisponibili, 0);
  if (totale === 0) return null;
  if (disponibili <= 0) return 'ESAURITO';
  if (disponibili / totale <= 0.2) return 'POCHI_POSTI';
  return null;
}

/** Applica il calcolo automatico sopra a un evento (o elenco di eventi)
 *  destinato al SITO PUBBLICO — non va usata per i dati che tornano al
 *  form del gestionale, altrimenti l'amministratore non riuscirebbe più
 *  a distinguere "è in automatico" da "l'ho impostato io", e ogni volta
 *  che salva il form "congelerebbe" per sbaglio il valore calcolato
 *  come se fosse una scelta manuale sua. */
function conStatoCalcolato<T extends { statoDisponibilita: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null; linee: { postiTotali: number; postiDisponibili: number }[] }>(evento: T): T {
  if (evento.statoDisponibilita) return evento; // scelta manuale, ha sempre la precedenza
  return { ...evento, statoDisponibilita: calcolaStatoAutomatico(evento.linee) };
}

/** Inserisce un tragitto (tratta) con le sue fermate — usata sia per i
 *  tragitti liberi sia per quelli dentro un viaggio. */
async function inserisciTragitto(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], eventoId: string, prodottoId: string | null, linea: z.infer<typeof lineaSchema>) {
  const [nuovaLinea] = await tx
    .insert(lineeBus)
    .values({
      eventoId,
      prodottoId,
      nome: linea.nome,
      postiTotali: linea.postiTotali,
      postiDisponibili: linea.postiTotali, // alla creazione tutti i posti sono liberi
      prezzoExtra: linea.prezzoExtra.toFixed(2),
      referenteNome: linea.referenteNome,
      referenteTelefono: linea.referenteTelefono,
      fornitoreId: linea.fornitoreId,
    })
    .returning();

  if (linea.fermate.length) {
    await tx.insert(fermate).values(
      linea.fermate.map((f, ordine) => ({
        lineaId: nuovaLinea.id,
        ordine,
        citta: f.citta,
        indirizzo: f.indirizzo,
        orario: f.orario,
        orarioRitorno: f.orarioRitorno,
        indirizzoRitorno: f.indirizzoRitorno,
        postiMax: f.postiMax,
        prezzo: f.prezzo?.toFixed(2),
      }))
    );
  }
}

/** Sincronizza i tragitti di un evento (o di un viaggio dentro l'evento)
 *  col form: quelli con un `id` vengono aggiornati sul posto (mai
 *  cancellati e ricreati — perderebbe le prenotazioni collegate),
 *  quelli senza sono nuovi, quelli rimasti fuori dal form vengono
 *  "eliminati" (cestino, recuperabili). */
async function sincronizzaTragitti(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], eventoId: string, prodottoId: string | null, tratte: z.infer<typeof lineaSchema>[]) {
  const condizioneProdotto = prodottoId === null ? isNull(lineeBus.prodottoId) : eq(lineeBus.prodottoId, prodottoId);
  const esistenti = await tx.select().from(lineeBus).where(and(eq(lineeBus.eventoId, eventoId), condizioneProdotto, isNull(lineeBus.eliminatoIl)));
  const idsInviati = new Set(tratte.filter((l) => l.id).map((l) => l.id));

  for (const esistente of esistenti) {
    if (idsInviati.has(esistente.id)) continue;
    await tx.update(lineeBus).set({ eliminatoIl: new Date() }).where(eq(lineeBus.id, esistente.id));
  }

  for (const linea of tratte) {
    const giaEsistente = linea.id ? esistenti.find((l) => l.id === linea.id) : undefined;

    if (giaEsistente) {
      // I posti occupati (venduti) restano tali: se cambi i posti
      // totali, i disponibili si aggiustano della stessa quantità,
      // invece di essere resettati (perderebbe traccia di chi ha già
      // prenotato).
      const postiOccupati = giaEsistente.postiTotali - giaEsistente.postiDisponibili;
      const nuoviPostiDisponibili = Math.max(0, linea.postiTotali - postiOccupati);

      await tx.update(lineeBus).set({
        prodottoId,
        nome: linea.nome,
        postiTotali: linea.postiTotali,
        postiDisponibili: nuoviPostiDisponibili,
        prezzoExtra: linea.prezzoExtra.toFixed(2),
        referenteNome: linea.referenteNome,
        referenteTelefono: linea.referenteTelefono,
        fornitoreId: linea.fornitoreId,
      }).where(eq(lineeBus.id, giaEsistente.id));

      // Le fermate non hanno prenotazioni collegate direttamente (le
      // prenotazioni salvano città/indirizzo come testo, non un
      // riferimento), quindi qui si possono sostituire liberamente.
      await tx.delete(fermate).where(eq(fermate.lineaId, giaEsistente.id));
      if (linea.fermate.length) {
        await tx.insert(fermate).values(
          linea.fermate.map((f, ordine) => ({
            lineaId: giaEsistente.id,
            ordine,
            citta: f.citta,
            indirizzo: f.indirizzo,
            orario: f.orario,
            orarioRitorno: f.orarioRitorno,
            indirizzoRitorno: f.indirizzoRitorno,
            postiMax: f.postiMax,
            prezzo: f.prezzo?.toFixed(2),
          }))
        );
      }
    } else {
      await inserisciTragitto(tx, eventoId, prodottoId, linea);
    }
  }
}

export const eventiService = {
  /** Crea un prodotto (pacchetto bus distinto) per un evento — da qui
   *  in poi le tratte di quell'evento possono essere assegnate a
   *  questo prodotto invece che restare "libere". */
  async creaProdotto(eventoId: string, nome: string, arrivoOrario?: string) {
    const [nuovo] = await db.insert(prodotti).values({ eventoId, nome, arrivoOrario }).returning();
    return nuovo;
  },
  async aggiornaProdotto(id: string, dati: { nome?: string; arrivoOrario?: string | null }) {
    const [aggiornato] = await db.update(prodotti).set(dati).where(eq(prodotti.id, id)).returning();
    if (!aggiornato) throw new NonTrovato('Prodotto');
    return aggiornato;
  },
  /** Eliminare un prodotto libera le sue tratte (tornano "senza
   *  prodotto"), non le cancella — evita di perdere lavoro fatto per
   *  errore nel censimento. */
  async eliminaProdotto(id: string) {
    await db.update(lineeBus).set({ prodottoId: null }).where(eq(lineeBus.prodottoId, id));
    await db.delete(prodotti).where(eq(prodotti.id, id));
  },

  async list(query: ListaEventiQuery) {
    // Nascosti sempre, sia per il gestionale sia per il sito pubblico —
    // solo il Cestino (funzione dedicata più sotto) li fa vedere.
    const condizioni = [isNull(eventi.eliminatoIl)];
    if (query.citta) condizioni.push(ilike(eventi.citta, `%${query.citta}%`));
    if (query.genere) condizioni.push(ilike(eventi.genere, `%${query.genere}%`));
    if (query.soloInEvidenza) condizioni.push(eq(eventi.inEvidenza, true));
    if (query.ricerca?.trim()) {
      const q = `%${query.ricerca.trim()}%`;
      condizioni.push(sql`(${ilike(eventi.artista, q)} OR ${ilike(eventi.luogo, q)} OR ${ilike(eventi.citta, q)})`);
    }
    if (query.soloFuturi) condizioni.push(sql`${eventi.data} >= now()`);
    if (query.soloVisibili) {
      condizioni.push(eq(eventi.visibileSito, true));
      condizioni.push(eq(eventi.bozza, false)); // le bozze non compaiono mai sul sito pubblico
    }

    const risultati = await db.query.eventi.findMany({
      where: and(...condizioni),
      with: includeCompleto,
      orderBy: (e, { asc }) => [asc(e.data)],
    });
    return risultati.map(conStatoCalcolato);
  },

  getById,

  /** Recupera un evento dal suo slug pubblico (per la pagina dedicata
   *  /eventi/:slug) — visibile solo se non è già passato e non è stato
   *  nascosto manualmente, stessa regola della home. */
  async getBySlug(slug: string) {
    const evento = await db.query.eventi.findFirst({
      where: eq(eventi.slug, slug),
      with: includeCompleto,
    });
    if (!evento) throw new NonTrovato('Evento');
    if (!evento.visibileSito || evento.bozza || evento.eliminatoIl || new Date(evento.data) < new Date()) throw new NonTrovato('Evento');
    return conStatoCalcolato(evento);
  },

  async create(input: CreaEventoInput) {
    const slug = await generaSlugUnivoco(input.slug?.trim() || `${input.artista}-${input.citta}`);
    return db.transaction(async (tx) => {
      const [nuovoEvento] = await tx
        .insert(eventi)
        .values({
          slug,
          artista: input.artista,
          genere: input.genere,
          luogo: input.luogo,
          citta: input.citta,
          data: input.data,
          prezzo: input.prezzo?.toFixed(2),
          inEvidenza: input.inEvidenza,
          ordineEvidenza: input.ordineEvidenza,
          vetrinaDal: input.vetrinaDal,
          vetrinaAl: input.vetrinaAl,
          accontoEur: input.accontoEur?.toFixed(2),
          statoDisponibilita: input.statoDisponibilita,
          arrivoIndirizzo: input.arrivoIndirizzo,
          arrivoOrario: input.arrivoOrario,
          visibileSito: input.visibileSito,
          bozza: input.bozza ?? false,
          descrizione: input.descrizione,
          descrizioneSeo: input.descrizioneSeo,
          ticketColoreAccento: input.ticketColoreAccento,
          ticketImmagineSfondoUrl: input.ticketImmagineSfondoUrl,
          layoutBigliettoId: input.layoutBigliettoId,
        })
        .returning();

      if (input.immagini.length) {
        await tx.insert(immaginiEvento).values(
          input.immagini.map((url, ordine) => ({ eventoId: nuovoEvento.id, url, ordine }))
        );
      }
      if (input.allegati.length) {
        await tx.insert(allegatiEvento).values(
          input.allegati.map((a) => ({ eventoId: nuovoEvento.id, nome: a.nome, url: a.url }))
        );
      }
      for (const linea of input.linee.filter((l) => !l.prodottoId)) {
        await inserisciTragitto(tx, nuovoEvento.id, linea.prodottoId ?? null, linea);
      }
      for (const viaggio of input.prodotti) {
        const [nuovoViaggio] = await tx.insert(prodotti).values({
          eventoId: nuovoEvento.id, nome: viaggio.nome, arrivoOrario: viaggio.arrivoOrario,
        }).returning();
        for (const linea of viaggio.linee) {
          await inserisciTragitto(tx, nuovoEvento.id, nuovoViaggio.id, linea);
        }
      }

      return nuovoEvento.id;
    });
  },

  async update(id: string, input: AggiornaEventoInput) {
    await getById(id); // lancia NonTrovato se non esiste
    const nuovoSlug = input.slug?.trim() ? await generaSlugUnivoco(input.slug.trim(), id) : undefined;

    return db.transaction(async (tx) => {
      await tx
        .update(eventi)
        .set({
          ...(input.artista !== undefined && { artista: input.artista }),
          ...(input.genere !== undefined && { genere: input.genere }),
          ...(input.luogo !== undefined && { luogo: input.luogo }),
          ...(input.citta !== undefined && { citta: input.citta }),
          ...(input.data !== undefined && { data: input.data }),
          ...(input.prezzo !== undefined && { prezzo: input.prezzo.toFixed(2) }),
          ...(input.inEvidenza !== undefined && { inEvidenza: input.inEvidenza }),
          ...(input.ordineEvidenza !== undefined && { ordineEvidenza: input.ordineEvidenza }),
          ...(input.vetrinaDal !== undefined && { vetrinaDal: input.vetrinaDal }),
          ...(input.vetrinaAl !== undefined && { vetrinaAl: input.vetrinaAl }),
          ...(input.accontoEur !== undefined && { accontoEur: input.accontoEur.toFixed(2) }),
          ...(input.statoDisponibilita !== undefined && { statoDisponibilita: input.statoDisponibilita }),
          ...(nuovoSlug !== undefined && { slug: nuovoSlug }),
          ...(input.arrivoIndirizzo !== undefined && { arrivoIndirizzo: input.arrivoIndirizzo }),
          ...(input.arrivoOrario !== undefined && { arrivoOrario: input.arrivoOrario }),
          ...(input.visibileSito !== undefined && { visibileSito: input.visibileSito }),
          ...(input.bozza !== undefined && { bozza: input.bozza }),
          ...(input.descrizione !== undefined && { descrizione: input.descrizione }),
          ...(input.descrizioneSeo !== undefined && { descrizioneSeo: input.descrizioneSeo }),
          ...(input.ticketColoreAccento !== undefined && { ticketColoreAccento: input.ticketColoreAccento }),
          ...(input.ticketImmagineSfondoUrl !== undefined && { ticketImmagineSfondoUrl: input.ticketImmagineSfondoUrl }),
          ...(input.layoutBigliettoId !== undefined && { layoutBigliettoId: input.layoutBigliettoId }),
          aggiornatoIl: new Date(),
        })
        .where(eq(eventi.id, id));

      // Le immagini/allegati, se inviati, sostituiscono interamente quelli
      // esistenti — nessun problema di vincoli qui (a differenza delle
      // tratte), non ci sono altre tabelle che li referenziano.
      if (input.immagini !== undefined) {
        await tx.delete(immaginiEvento).where(eq(immaginiEvento.eventoId, id));
        if (input.immagini.length) {
          await tx.insert(immaginiEvento).values(
            input.immagini.map((url, ordine) => ({ eventoId: id, url, ordine }))
          );
        }
      }
      if (input.allegati !== undefined) {
        await tx.delete(allegatiEvento).where(eq(allegatiEvento.eventoId, id));
        if (input.allegati.length) {
          await tx.insert(allegatiEvento).values(
            input.allegati.map((a) => ({ eventoId: id, nome: a.nome, url: a.url }))
          );
        }
      }

      // I tragitti liberi (non dentro nessun viaggio) — quelli dentro un
      // viaggio si sincronizzano più sotto, insieme al viaggio stesso.
      if (input.linee) {
        await sincronizzaTragitti(tx, id, null, input.linee.filter((l) => !l.prodottoId));
      }

      // I viaggi — stessa logica di sincronizzazione dei tragitti: id
      // esistente = aggiorna, assente = nuovo, rimasto fuori dal form =
      // eliminato (le sue tratte tornano "libere", non si perdono).
      if (input.prodotti) {
        const viaggiEsistenti = await tx.select().from(prodotti).where(eq(prodotti.eventoId, id));
        const idsInviati = new Set(input.prodotti.filter((p) => p.id).map((p) => p.id));

        for (const esistente of viaggiEsistenti) {
          if (idsInviati.has(esistente.id)) continue;
          await tx.update(lineeBus).set({ prodottoId: null }).where(eq(lineeBus.prodottoId, esistente.id));
          await tx.delete(prodotti).where(eq(prodotti.id, esistente.id));
        }

        for (const viaggio of input.prodotti) {
          if (viaggio.id) {
            await tx.update(prodotti).set({ nome: viaggio.nome, arrivoOrario: viaggio.arrivoOrario }).where(eq(prodotti.id, viaggio.id));
            await sincronizzaTragitti(tx, id, viaggio.id, viaggio.linee);
          } else {
            const [nuovoViaggio] = await tx.insert(prodotti).values({ eventoId: id, nome: viaggio.nome, arrivoOrario: viaggio.arrivoOrario }).returning();
            for (const linea of viaggio.linee) await inserisciTragitto(tx, id, nuovoViaggio.id, linea);
          }
        }
      }

      return id;
    });
  },

  /** "Elimina" un evento — non lo cancella per davvero (le prenotazioni
   *  collegate resterebbero orfane): lo nasconde ovunque, recuperabile
   *  dal Cestino. Nessun blocco per prenotazioni collegate, a differenza
   *  di prima: qui non c'è più nulla da perdere per davvero. */
  async remove(id: string) {
    await getById(id);
    await db.update(eventi).set({ eliminatoIl: new Date() }).where(eq(eventi.id, id));
  },

  /** Elenco eventi nel Cestino — solo quelli eliminati, con le tratte
   *  che avevano (anche loro nascoste normalmente, ma qui servono per
   *  farsi un'idea di cosa si sta per ripristinare). */
  async eventiEliminati() {
    return db.query.eventi.findMany({
      where: sql`${eventi.eliminatoIl} is not null`,
      with: { linee: true, immagini: true },
      orderBy: (e, { desc }) => [desc(e.eliminatoIl)],
    });
  },

  async ripristinaEvento(id: string) {
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, id)).limit(1);
    if (!evento) throw new NonTrovato('Evento');
    await db.update(eventi).set({ eliminatoIl: null }).where(eq(eventi.id, id));
  },

  /** Tratte nel Cestino — con il nome dell'evento a cui appartengono,
   *  altrimenti un elenco di sole tratte senza contesto non direbbe
   *  molto. */
  async tratteEliminate() {
    return db
      .select({
        id: lineeBus.id,
        nome: lineeBus.nome,
        eliminatoIl: lineeBus.eliminatoIl,
        eventoId: lineeBus.eventoId,
        eventoArtista: eventi.artista,
      })
      .from(lineeBus)
      .innerJoin(eventi, eq(eventi.id, lineeBus.eventoId))
      .where(sql`${lineeBus.eliminatoIl} is not null`)
      .orderBy(sql`${lineeBus.eliminatoIl} desc`);
  },

  async ripristinaTratta(id: string) {
    const [linea] = await db.select().from(lineeBus).where(eq(lineeBus.id, id)).limit(1);
    if (!linea) throw new NonTrovato('Tratta');
    await db.update(lineeBus).set({ eliminatoIl: null }).where(eq(lineeBus.id, id));
  },

  /** Somma i posti disponibili su tutte le linee di un evento. */
  postiTotaliDisponibili(evento: Awaited<ReturnType<typeof getById>>) {
    return evento.linee.reduce((somma, l) => somma + l.postiDisponibili, 0);
  },

  /** Una riga per ogni fermata prenotabile, con il prezzo effettivo già
   *  calcolato (sovrascrive prezzo base+extra se la fermata ha un prezzo
   *  proprio) — usata dal checkout sul sito pubblico. */
  async opzioniPartenza(eventoId: string, prodottoId?: string) {
    const evento = await getById(eventoId);
    // Se l'evento ha viaggi distinti e ne è stato scelto uno, le
    // fermate mostrate sono solo le sue — altrimenti (evento senza
    // viaggi, o nessuno specificato) tutte quelle libere, come sempre.
    const lineeDaMostrare = prodottoId
      ? evento.prodotti.find((p) => p.id === prodottoId)?.linee ?? []
      : evento.linee.filter((l) => !l.prodottoId);
    const opzioni: Array<{
      lineaId: string;
      postiDisponibili: number;
      fermataId: string;
      fermataCitta: string;
      fermataIndirizzo: string;
      fermataOrario: string | null;
      orarioRitorno: string | null;
      indirizzoRitorno: string | null;
      prezzoEffettivo: number;
    }> = [];

    for (const linea of lineeDaMostrare) {
      // Nota: prima qui si saltava del tutto la tratta se il bus era
      // esaurito — ma così il cliente non aveva modo di scegliere PER
      // QUALE fermata mettersi in lista d'attesa (il menu restava vuoto).
      // Ora le fermate compaiono sempre, con posti disponibili a 0
      // quando è il caso: la scelta resta possibile, solo che porta
      // alla lista d'attesa invece che al pagamento.
      for (const f of linea.fermate) {
        const prezzoEffettivo = prezzoNormaleFermata(f, evento, linea);
        // Se questa fermata ha un limite posti suo (facoltativo), i suoi
        // posti disponibili sono il minore tra quanto le resta e quanto
        // resta sul bus in generale — così una fermata può esaurirsi da
        // sola anche se il bus nel complesso ha ancora posti altrove, ma
        // non può mai avere "più posti" di quelli davvero rimasti sul bus.
        const postiDisponibiliFermata = f.postiMax != null
          ? Math.min(linea.postiDisponibili, Math.max(0, f.postiMax - f.postiPrenotati))
          : linea.postiDisponibili;
        opzioni.push({
          lineaId: linea.id,
          postiDisponibili: postiDisponibiliFermata,
          fermataId: f.id,
          fermataCitta: f.citta,
          fermataIndirizzo: f.indirizzo,
          fermataOrario: f.orario,
          orarioRitorno: f.orarioRitorno,
          indirizzoRitorno: f.indirizzoRitorno,
          prezzoEffettivo,
        });
      }
    }
    return opzioni;
  },

  /**
   * Suggerisce quanti bus servono per ogni linea dell'evento, in base ai
   * passeggeri confermati per fermata. Logica (concordata con l'utente):
   * si percorrono le fermate in ordine; se i passeggeri di UNA fermata da
   * soli riempiono (o superano) un bus, quella fermata ottiene bus dedicati
   * partendo direttamente da lì; altrimenti i passeggeri di fermate vicine
   * si accumulano sullo stesso bus finché non si supera la capienza.
   * È un suggerimento, non un instradamento reale: l'orario di partenza
   * di ogni bus resta da compilare a mano (richiederebbe tempi di
   * percorrenza reali tra le città, non disponibili nel gestionale).
   */
  async calcolaBusNecessari(eventoId: string) {
    const evento = await getById(eventoId);
    const capienza = await leggiPostiPerBus();
    const lineeIds = evento.linee.map((l) => l.id);

    const prenotazioniConfermate = await db
      .select({ lineaId: prenotazioni.lineaId, fermataCitta: prenotazioni.fermataCitta, passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));

    // Per calcolare la copertura reale servono i bus davvero censiti su
    // ogni tratta, con i loro posti (facoltativi: un bus senza posti
    // indicati non contribuisce alla somma, invece di essere ignorato
    // del tutto o contare come 0 posti per errore).
    const assegnazioni = lineeIds.length ? await db.select().from(busTratte).where(inArray(busTratte.lineaId, lineeIds)) : [];
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const busCensiti = busIds.length ? await db.select().from(busFisici).where(inArray(busFisici.id, busIds)) : [];

    return evento.linee.map((linea) => {
      const fermateOrdinate = [...linea.fermate].sort((a, b) => a.ordine - b.ordine);

      const fermateConPasseggeri = fermateOrdinate.map((f) => {
        const passeggeri = prenotazioniConfermate
          .filter((p) => p.lineaId === linea.id && p.fermataCitta === f.citta)
          .reduce((somma, p) => somma + p.passeggeri, 0);
        return { fermataId: f.id, citta: f.citta, passeggeri };
      });

      let busSuggeriti = 0;
      let caricoBusCorrente = 0;
      for (const f of fermateConPasseggeri) {
        if (f.passeggeri >= capienza) {
          // Questa fermata da sola riempie almeno un bus: se c'era un bus
          // "in accumulo" da fermate precedenti, lo chiudo prima.
          if (caricoBusCorrente > 0) { busSuggeriti += 1; caricoBusCorrente = 0; }
          busSuggeriti += Math.floor(f.passeggeri / capienza);
          const resto = f.passeggeri % capienza;
          caricoBusCorrente = resto; // il resto prova ad accumularsi con le prossime fermate
        } else if (caricoBusCorrente + f.passeggeri <= capienza) {
          caricoBusCorrente += f.passeggeri;
        } else {
          busSuggeriti += 1; // il bus in accumulo è pieno, ne apro uno nuovo
          caricoBusCorrente = f.passeggeri;
        }
      }
      if (caricoBusCorrente > 0) busSuggeriti += 1;

      const totalePasseggeri = fermateConPasseggeri.reduce((s, f) => s + f.passeggeri, 0);

      // Coperta = automatico, non più un interruttore da cliccare: somma
      // i posti dei bus censiti su questa tratta e la confronta con i
      // passeggeri REALMENTE confermati (non con i posti pianificati —
      // quella è un'altra domanda, "sto vendendo più di quanto
      // previsto?", già visibile separatamente come "posti superati").
      const postiBusCensiti = busCensiti
        .filter((b) => assegnazioni.some((a) => a.busId === b.id && a.lineaId === linea.id))
        .reduce((s, b) => s + (b.postiBus ?? 0), 0);
      const coperta = totalePasseggeri > 0 && postiBusCensiti >= totalePasseggeri;

      return {
        lineaId: linea.id,
        prodottoId: linea.prodottoId,
        nome: linea.nome,
        postiTotali: linea.postiTotali,
        capienzaPerBus: capienza,
        fermate: fermateConPasseggeri,
        totalePasseggeri,
        busSuggeriti,
        coperta,
        postiBusCensiti,
      };
    });
  },

  /** Bus fisici collegati a una qualunque linea dell'evento, con le tratte
   *  (linee) che ciascuno copre. */
  async listaBus(eventoId: string) {
    const evento = await getById(eventoId);
    const lineeIds = evento.linee.map((l) => l.id);
    if (lineeIds.length === 0) return [];

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.lineaId, lineeIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    if (busIds.length === 0) return [];

    const bus = await db.select().from(busFisici).where(inArray(busFisici.id, busIds));
    const tourLeaderIds = bus.map((b) => b.tourLeaderId).filter((id): id is string => id !== null);
    const tourLeaders = tourLeaderIds.length ? await db.select().from(tourLeader).where(inArray(tourLeader.id, tourLeaderIds)) : [];

    return bus.map((b) => {
      const tl = tourLeaders.find((t) => t.id === b.tourLeaderId);
      return {
        ...b,
        lineeIds: assegnazioni.filter((a) => a.busId === b.id).map((a) => a.lineaId),
        tourLeaderNome: tl ? `${tl.nome} ${tl.cognome}` : null,
      };
    });
  },

  async creaBus(eventoId: string, input: { fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string; costo?: number; postiBus?: number; note?: string; lineeIds: string[] }) {
    const evento = await getById(eventoId);
    const lineeValide = new Set(evento.linee.map((l) => l.id));
    const lineeIdsFiltrate = input.lineeIds.filter((id) => lineeValide.has(id));
    if (lineeIdsFiltrate.length === 0) throw new ConflittoDati('Seleziona almeno una tratta di questo evento per il bus.');

    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(busFisici).values({
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        tourLeaderId: input.tourLeaderId,
        costo: input.costo?.toFixed(2),
        postiBus: input.postiBus,
        note: input.note,
      }).returning();
      await tx.insert(busTratte).values(lineeIdsFiltrate.map((lineaId) => ({ busId: nuovo.id, lineaId })));
      return nuovo.id;
    });
  },

  async aggiornaBus(eventoId: string, busId: string, input: { fornitoreId?: string; riferimento?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string; lineeIds?: string[] }) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');

    return db.transaction(async (tx) => {
      if (input.riferimento !== undefined || input.fornitoreId !== undefined || input.autistaNome !== undefined || input.autistaTelefono !== undefined || input.tourLeaderId !== undefined || input.costo !== undefined || input.postiBus !== undefined || input.note !== undefined) {
        await tx.update(busFisici).set({
          ...(input.riferimento !== undefined && { riferimento: input.riferimento }),
          ...(input.fornitoreId !== undefined && { fornitoreId: input.fornitoreId }),
          ...(input.autistaNome !== undefined && { autistaNome: input.autistaNome }),
          ...(input.autistaTelefono !== undefined && { autistaTelefono: input.autistaTelefono }),
          ...(input.tourLeaderId !== undefined && { tourLeaderId: input.tourLeaderId }),
          ...(input.costo !== undefined && { costo: input.costo.toFixed(2) }),
          ...(input.postiBus !== undefined && { postiBus: input.postiBus }),
          ...(input.note !== undefined && { note: input.note }),
        }).where(eq(busFisici.id, busId));
      }
      if (input.lineeIds !== undefined) {
        const evento = await getById(eventoId);
        const lineeValide = new Set(evento.linee.map((l) => l.id));
        const lineeIdsFiltrate = input.lineeIds.filter((id) => lineeValide.has(id));
        await tx.delete(busTratte).where(eq(busTratte.busId, busId));
        if (lineeIdsFiltrate.length > 0) {
          await tx.insert(busTratte).values(lineeIdsFiltrate.map((lineaId) => ({ busId, lineaId })));
        }
      }
    });
  },

  async rimuoviBus(busId: string) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');
    await db.delete(busFisici).where(eq(busFisici.id, busId)); // cascade su bus_tratte
  },

  /** Elenco passeggeri (per la "lista tipo Excel" da dare al tour leader)
   *  per un bus specifico: tutti i partecipanti delle prenotazioni
   *  CONFERMATA sulle tratte coperte da quel bus. */
  async listaPasseggeriBus(busId: string) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');

    const assegnazioni = await db.select().from(busTratte).where(eq(busTratte.busId, busId));
    const lineeIds = assegnazioni.map((a) => a.lineaId);
    if (lineeIds.length === 0) return [];

    const righe = await db
      .select({
        prenotazioneId: prenotazioni.id,
        pnr: prenotazioni.pnr,
        fermataCitta: prenotazioni.fermataCitta,
        telefonoReferente: prenotazioni.referenteTelefono,
      })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.lineaId, lineeIds), eq(prenotazioni.stato, 'CONFERMATA')));

    if (righe.length === 0) return [];

    const prenotazioneIds = righe.map((r) => r.prenotazioneId);
    const partecipantiRighe = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(inArray(partecipantiPrenotazione.prenotazioneId, prenotazioneIds))
      .orderBy(partecipantiPrenotazione.ordine);

    const utentiPerPrenotazione = await db
      .select({ prenotazioneId: prenotazioni.id, telefono: utenti.telefono, email: utenti.email })
      .from(prenotazioni)
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .where(inArray(prenotazioni.id, prenotazioneIds));

    const elenco: { pnr: string; nome: string; cognome: string; fermata: string; telefono: string; email: string }[] = [];
    for (const r of righe) {
      const contatto = utentiPerPrenotazione.find((u) => u.prenotazioneId === r.prenotazioneId);
      const partecipanti = partecipantiRighe.filter((p) => p.prenotazioneId === r.prenotazioneId);
      for (const p of partecipanti) {
        elenco.push({
          pnr: r.pnr,
          nome: p.nome,
          cognome: p.cognome,
          fermata: r.fermataCitta,
          telefono: contatto?.telefono ?? '',
          email: contatto?.email ?? '',
        });
      }
    }
    return elenco;
  },

  /** Incassato, costo bus e guadagno per ogni tratta dell'evento —
   *  l'incassato conta solo le prenotazioni CONFERMATA su quella tratta
   *  (l'acconto versato per intero, non solo la parte già incassata: è
   *  il "totale" della prenotazione, coerente con come viene mostrato
   *  ovunque nel gestionale). Il costo è la somma dei bus registrati su
   *  quella tratta (un bus copre sempre una tratta sola, come deciso). */
  async riepilogoEconomico(eventoId: string) {
    const evento = await getById(eventoId);
    const lineeIds = evento.linee.map((l) => l.id);
    if (lineeIds.length === 0) return [];

    const prenotazioniConfermate = await db
      .select({ lineaId: prenotazioni.lineaId, totale: prenotazioni.totale })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.lineaId, lineeIds), eq(prenotazioni.stato, 'CONFERMATA')));

    const assegnazioni = lineeIds.length ? await db.select().from(busTratte).where(inArray(busTratte.lineaId, lineeIds)) : [];
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const bus = busIds.length ? await db.select().from(busFisici).where(inArray(busFisici.id, busIds)) : [];

    return evento.linee.map((linea) => {
      const incassato = prenotazioniConfermate
        .filter((p) => p.lineaId === linea.id)
        .reduce((s, p) => s + Number(p.totale), 0);

      const busIdsTratta = assegnazioni.filter((a) => a.lineaId === linea.id).map((a) => a.busId);
      const busTratta = bus.filter((b) => busIdsTratta.includes(b.id));
      const costoCensito = busTratta.some((b) => b.costo !== null);
      const costo = busTratta.reduce((s, b) => s + (b.costo ? Number(b.costo) : 0), 0);

      return {
        lineaId: linea.id,
        nome: linea.nome,
        incassato,
        costo,
        costoCensito, // false = nessun bus ha un costo compilato: il guadagno non è affidabile, va segnalato
        guadagno: incassato - costo,
      };
    });
  },

  /** Conta quante tratte, in tutti gli eventi, NON sono coperte — cioè
   *  hanno passeggeri confermati ma i bus censiti su quella tratta non
   *  bastano a contenerli tutti. Usato per il pallino di notifica sulla
   *  voce "Partenze" nel menu del gestionale: prima segnalava "posti
   *  superati" rispetto al pianificato, ora segnala il problema
   *  operativo vero — non hai ancora censito bus a sufficienza. */
  /** Due numeri rapidi per ogni evento — quanti passeggeri confermati e
   *  quanti bus fisici sono stati censiti — usati dal Calendario per
   *  dare un colpo d'occhio senza dover aprire ogni evento. */
  async statistichePerEvento(): Promise<Record<string, { partecipanti: number; busCensiti: number }>> {
    const righeLinee = await db.select({ lineaId: lineeBus.id, eventoId: lineeBus.eventoId }).from(lineeBus);
    const mappaEventoDiLinea = new Map(righeLinee.map((r) => [r.lineaId, r.eventoId]));

    const somme = await db
      .select({ lineaId: prenotazioni.lineaId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.lineaId);

    const risultato: Record<string, { partecipanti: number; busCensiti: number }> = {};
    for (const s of somme) {
      const eventoId = mappaEventoDiLinea.get(s.lineaId);
      if (!eventoId) continue;
      risultato[eventoId] ??= { partecipanti: 0, busCensiti: 0 };
      risultato[eventoId].partecipanti += Number(s.totale);
    }

    const assegnazioni = await db.select().from(busTratte);
    const busPerEvento = new Map<string, Set<string>>();
    for (const a of assegnazioni) {
      const eventoId = mappaEventoDiLinea.get(a.lineaId);
      if (!eventoId) continue;
      if (!busPerEvento.has(eventoId)) busPerEvento.set(eventoId, new Set());
      busPerEvento.get(eventoId)!.add(a.busId);
    }
    for (const [eventoId, bus] of busPerEvento) {
      risultato[eventoId] ??= { partecipanti: 0, busCensiti: 0 };
      risultato[eventoId].busCensiti = bus.size;
    }

    return risultato;
  },

  async contaAllertePartenze() {
    const righeLinee = await db.select({ lineaId: lineeBus.id }).from(lineeBus);
    if (righeLinee.length === 0) return 0;
    const tutteLineeIds = righeLinee.map((r) => r.lineaId);

    const somme = await db
      .select({ lineaId: prenotazioni.lineaId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.lineaId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.lineaId, Number(s.totale)]));

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.lineaId, tutteLineeIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const bus = busIds.length ? await db.select({ id: busFisici.id, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.id, busIds)) : [];
    const mappaBus = new Map(bus.map((b) => [b.id, b.postiBus ?? 0]));

    let conteggio = 0;
    for (const lineaId of tutteLineeIds) {
      const passeggeri = mappaPasseggeri.get(lineaId) ?? 0;
      if (passeggeri === 0) continue; // niente da coprire, non è un allarme
      const postiBusCensiti = assegnazioni
        .filter((a) => a.lineaId === lineaId)
        .reduce((s, a) => s + (mappaBus.get(a.busId) ?? 0), 0);
      if (postiBusCensiti < passeggeri) conteggio++;
    }
    return conteggio;
  },

  /** Come sopra, ma per singolo evento — quante tratte con posti
   *  superati ha OGNI evento (non solo il totale generale), usata per
   *  mostrare il pallino di avviso sulla card dell'evento specifico
   *  nella sezione Partenze, non solo nel menu laterale. */
  async allertePartenzePerEvento(): Promise<Record<string, number>> {
    const righeLinee = await db.select({ lineaId: lineeBus.id, eventoId: lineeBus.eventoId }).from(lineeBus);
    if (righeLinee.length === 0) return {};
    const tutteLineeIds = righeLinee.map((r) => r.lineaId);
    const mappaEventoDiLinea = new Map(righeLinee.map((r) => [r.lineaId, r.eventoId]));

    const somme = await db
      .select({ lineaId: prenotazioni.lineaId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.lineaId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.lineaId, Number(s.totale)]));

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.lineaId, tutteLineeIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const bus = busIds.length ? await db.select({ id: busFisici.id, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.id, busIds)) : [];
    const mappaBus = new Map(bus.map((b) => [b.id, b.postiBus ?? 0]));

    const risultato: Record<string, number> = {};
    for (const lineaId of tutteLineeIds) {
      const passeggeri = mappaPasseggeri.get(lineaId) ?? 0;
      if (passeggeri === 0) continue;
      const postiBusCensiti = assegnazioni
        .filter((a) => a.lineaId === lineaId)
        .reduce((s, a) => s + (mappaBus.get(a.busId) ?? 0), 0);
      if (postiBusCensiti < passeggeri) {
        const eventoId = mappaEventoDiLinea.get(lineaId)!;
        risultato[eventoId] = (risultato[eventoId] ?? 0) + 1;
      }
    }
    return risultato;
  },
};
