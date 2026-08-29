import { and, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  eventi,
  tragitti,
  servizi,
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
import { tragittoSchema, aggiornaTragittoOperativoSchema } from './eventi.dto.js';
import { rilevaVariazioni, generaComunicazioniVariazione } from '../variazioni/variazioni.service.js';
import type { z } from 'zod';

// Include standard riusato da list/getById: evento con tutte le sue
// relazioni annidate, così il frontend riceve un unico oggetto completo
// (esattamente come faceva il vecchio inbusLoadDB() nel prototipo).
export const includeCompleto = {
  // Nascoste ovunque venga usata questa query condivisa (form di
  // modifica, sito pubblico, checkout) — restano recuperabili solo
  // tramite le funzioni dedicate del Cestino qui sotto.
  // "Tragitti liberi" veri — SOLO quelli senza un servizio assegnato
  // (servizioId nullo). Prima mancava questa condizione: un tragitto
  // con servizioId impostato finiva ANCHE qui (oltre che dentro il suo
  // servizio, sotto), duplicando ogni sua fermata ovunque venga
  // mostrato il percorso completo.
  tragitti: { where: and(isNull(tragitti.eliminatoIl), isNull(tragitti.servizioId)), with: { fermate: true } },
  // I servizi (se l'evento ne ha) — ognuno con le proprie tratte. Un
  // evento senza nessun servizio (il caso normale) ha semplicemente un
  // array vuoto qui: tutto continua a funzionare come prima.
  servizi: { with: { tragitti: { where: isNull(tragitti.eliminatoIl), with: { fermate: true } } } },
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
function calcolaStatoAutomatico(tragitti: { postiTotali: number; postiDisponibili: number }[]): 'POCHI_POSTI' | 'ESAURITO' | null {
  if (tragitti.length === 0) return null;
  const totale = tragitti.reduce((s, l) => s + l.postiTotali, 0);
  const disponibili = tragitti.reduce((s, l) => s + l.postiDisponibili, 0);
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
function conStatoCalcolato<T extends {
  statoDisponibilita: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null;
  tragitti: { postiTotali: number; postiDisponibili: number; attivo: boolean; stato: 'DA_CONFERMARE' | 'CONFERMATO' }[];
  servizi: { tragitti: { postiTotali: number; postiDisponibili: number; attivo: boolean; stato: 'DA_CONFERMARE' | 'CONFERMATO' }[] }[];
}>(evento: T): T {
  if (evento.statoDisponibilita) return evento; // scelta manuale, ha sempre la precedenza
  // Il calcolo considera SIA i tragitti liberi SIA quelli di ogni
  // servizio (altrimenti un evento a servizi, dove i tragitti veri
  // vivono tutti dentro i servizi, risulterebbe sempre senza dati per
  // il calcolo automatico) — ma il campo "tragitti" restituito al sito
  // resta quello originale, invariato: il frontend li combina già da
  // solo dove serve, sommarli anche qui li farebbe contare due volte.
  // Un tragitto disattivato o ancora "da confermare" (nessun bus vero)
  // non contribuisce: i suoi posti non sono davvero acquistabili,
  // includerli darebbe un falso senso di disponibilità ancora ampia.
  const tuttiPerIlCalcolo = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].filter((t) => t.attivo && t.stato === 'CONFERMATO');
  return { ...evento, statoDisponibilita: calcolaStatoAutomatico(tuttiPerIlCalcolo) };
}

/** Inserisce un tragitto (tratta) con le sue fermate — usata sia per i
 *  tragitti liberi sia per quelli dentro un servizio. */
async function inserisciTragitto(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], eventoId: string, servizioId: string | null, tragitto: z.infer<typeof tragittoSchema>) {
  const [nuovoTragitto] = await tx
    .insert(tragitti)
    .values({
      eventoId,
      servizioId,
      nome: tragitto.nome,
      postiTotali: tragitto.postiTotali,
      postiDisponibili: tragitto.postiTotali, // alla creazione tutti i posti sono liberi
      prezzoExtra: tragitto.prezzoExtra.toFixed(2),
      attivo: tragitto.attivo,
      referenteNome: tragitto.referenteNome,
      referenteTelefono: tragitto.referenteTelefono,
      fornitoreId: tragitto.fornitoreId,
    })
    .returning();

  if (tragitto.fermate.length) {
    await tx.insert(fermate).values(
      tragitto.fermate.map((f, ordine) => ({
        tragittoId: nuovoTragitto.id,
        ordine,
        fermataAnagraficaId: f.fermataAnagraficaId,
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

/** Sincronizza i tragitti di un evento (o di un servizio dentro l'evento)
 *  col form: quelli con un `id` vengono aggiornati sul posto (mai
 *  cancellati e ricreati — perderebbe le prenotazioni collegate),
 *  quelli senza sono nuovi, quelli rimasti fuori dal form vengono
 *  "eliminati" (cestino, recuperabili). */
/** Sincronizza TUTTI i tragitti di un evento in un solo passaggio —
 *  liberi e di ogni servizio insieme, non un contesto alla volta.
 *  Fondamentale: se lo facessi un servizio alla volta, un tragitto che
 *  CAMBIA servizio (o passa da libero a un servizio, come quando si
 *  converte un evento a servizio singolo in "più servizi") sparirebbe
 *  dal contesto vecchio e ricomparirebbe in quello nuovo — visto un
 *  contesto alla volta, sembra un'eliminazione vera (e se ha
 *  prenotazioni confermate, il salvataggio si blocca per errore anche
 *  se il tragitto non stava affatto sparendo, solo cambiando servizio).
 *  Qui invece si guarda una volta sola dove finisce OGNI id in tutto
 *  il nuovo payload — solo chi non compare più DA NESSUNA PARTE viene
 *  trattato come eliminazione vera. */
async function sincronizzaTuttiITragitti(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  eventoId: string,
  bersagli: { servizioId: string | null; tragitto: z.infer<typeof tragittoSchema> }[]
) {
  const esistenti = await tx.select().from(tragitti).where(and(eq(tragitti.eventoId, eventoId), isNull(tragitti.eliminatoIl)));
  const idsInPayload = new Set(bersagli.filter((b) => b.tragitto.id).map((b) => b.tragitto.id));

  for (const esistente of esistenti) {
    if (idsInPayload.has(esistente.id)) continue; // presente da qualche parte nel nuovo payload — non è un'eliminazione, se ne occupa il giro sotto
    const [conPrenotazioni] = await tx.select({ id: prenotazioni.id }).from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, esistente.id), eq(prenotazioni.stato, 'CONFERMATA'))).limit(1);
    if (conPrenotazioni) {
      throw new ConflittoDati(`Il tragitto "${esistente.nome}" ha prenotazioni confermate — non può essere rimosso. Annulla o sposta quelle prenotazioni prima di rimuoverlo.`);
    }
    await tx.update(tragitti).set({ eliminatoIl: new Date() }).where(eq(tragitti.id, esistente.id));
  }

  for (const { servizioId, tragitto } of bersagli) {
    const giaEsistente = tragitto.id ? esistenti.find((l) => l.id === tragitto.id) : undefined;

    if (giaEsistente) {
      // I posti occupati (venduti) restano tali: se cambi i posti
      // totali, i disponibili si aggiustano della stessa quantità,
      // invece di essere resettati (perderebbe traccia di chi ha già
      // prenotato).
      const postiOccupati = giaEsistente.postiTotali - giaEsistente.postiDisponibili;
      const nuoviPostiDisponibili = Math.max(0, tragitto.postiTotali - postiOccupati);

      await tx.update(tragitti).set({
        servizioId,
        nome: tragitto.nome,
        postiTotali: tragitto.postiTotali,
        postiDisponibili: nuoviPostiDisponibili,
        prezzoExtra: tragitto.prezzoExtra.toFixed(2),
        attivo: tragitto.attivo,
        referenteNome: tragitto.referenteNome,
        referenteTelefono: tragitto.referenteTelefono,
        fornitoreId: tragitto.fornitoreId,
      }).where(eq(tragitti.id, giaEsistente.id));

      // Le fermate non hanno prenotazioni collegate direttamente (le
      // prenotazioni salvano città/indirizzo come testo, non un
      // riferimento), quindi qui si possono sostituire liberamente.
      await tx.delete(fermate).where(eq(fermate.tragittoId, giaEsistente.id));
      if (tragitto.fermate.length) {
        await tx.insert(fermate).values(
          tragitto.fermate.map((f, ordine) => ({
            tragittoId: giaEsistente.id,
            ordine,
            fermataAnagraficaId: f.fermataAnagraficaId,
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
      await inserisciTragitto(tx, eventoId, servizioId, tragitto);
    }
  }
}

export const eventiService = {
  /** Crea un servizio (pacchetto bus distinto) per un evento — da qui
   *  in poi le tratte di quell'evento possono essere assegnate a
   *  questo servizio invece che restare "libere". */
  async creaServizio(eventoId: string, nome: string, arrivoOrario?: string) {
    const [nuovo] = await db.insert(servizi).values({ eventoId, nome, arrivoOrario }).returning();
    return nuovo;
  },
  async aggiornaServizio(id: string, dati: { nome?: string; arrivoIndirizzo?: string | null; arrivoOrario?: string | null }) {
    const [aggiornato] = await db.update(servizi).set(dati).where(eq(servizi.id, id)).returning();
    if (!aggiornato) throw new NonTrovato('Servizio');
    return aggiornato;
  },
  /** Eliminare un servizio libera le sue tratte (tornano "senza
   *  servizio"), non le cancella — evita di perdere lavoro fatto per
   *  errore nel censimento. */
  async eliminaServizio(id: string) {
    await db.update(tragitti).set({ servizioId: null }).where(eq(tragitti.servizioId, id));
    await db.delete(servizi).where(eq(servizi.id, id));
  },

  async list(query: ListaEventiQuery) {
    // Nascosti sempre, sia per il gestionale sia per il sito pubblico —
    // solo il Cestino (funzione dedicata più sotto) li fa vedere.
    const condizioni = [isNull(eventi.eliminatoIl)];
    if (query.citta) condizioni.push(ilike(eventi.citta, `%${query.citta}%`));
    if (query.genere) condizioni.push(ilike(eventi.genere, `%${query.genere}%`));
    if (query.categoria) condizioni.push(eq(eventi.categoria, query.categoria));
    if (query.soloInEvidenza) condizioni.push(eq(eventi.inEvidenza, true));
    if (query.ricerca?.trim()) {
      const q = `%${query.ricerca.trim()}%`;
      condizioni.push(sql`(${ilike(eventi.artista, q)} OR ${ilike(eventi.luogo, q)} OR ${ilike(eventi.citta, q)})`);
    }
    if (query.soloFuturi) condizioni.push(sql`${eventi.data} >= now()`);
    if (query.soloVisibili) {
      condizioni.push(eq(eventi.visibileSito, true));
      condizioni.push(eq(eventi.bozza, false)); // le bozze non compaiono mai sul sito pubblico
      // Un evento senza nemmeno un tragitto confermato (nessun bus vero
      // registrato) non compare affatto — come se non esistesse ancora,
      // non solo "senza niente da prenotare". Basta UN tragitto
      // confermato in un servizio qualsiasi (o libero) perché l'evento
      // torni visibile. Due passaggi invece di una sotto-query SQL
      // scritta a mano dentro il where — più facile da verificare che
      // faccia davvero quello che deve.
      const righeConfermate = await db.selectDistinct({ eventoId: tragitti.eventoId }).from(tragitti)
        .where(and(eq(tragitti.stato, 'CONFERMATO'), eq(tragitti.attivo, true)));
      const idEventiConfermati = righeConfermate.map((r) => r.eventoId);
      if (idEventiConfermati.length === 0) return []; // nessun evento ha nemmeno un tragitto confermato: lista vuota, senza nemmeno interrogare il resto
      condizioni.push(inArray(eventi.id, idEventiConfermati));
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
    // Stessa regola della lista: senza nemmeno un tragitto confermato,
    // l'evento non esiste ancora per il sito — nemmeno con un link
    // diretto allo slug.
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    if (!tuttiITragitti.some((t) => t.attivo && t.stato === 'CONFERMATO')) throw new NonTrovato('Evento');
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
          categoria: input.categoria ?? null,
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
      for (const tragitto of input.tragitti.filter((l) => !l.servizioId)) {
        await inserisciTragitto(tx, nuovoEvento.id, tragitto.servizioId ?? null, tragitto);
      }
      for (const servizio of input.servizi) {
        const [nuovoServizio] = await tx.insert(servizi).values({
          eventoId: nuovoEvento.id, nome: servizio.nome, arrivoIndirizzo: servizio.arrivoIndirizzo, arrivoOrario: servizio.arrivoOrario,
        }).returning();
        for (const tragitto of servizio.tragitti) {
          await inserisciTragitto(tx, nuovoEvento.id, nuovoServizio.id, tragitto);
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
          ...(input.categoria !== undefined && { categoria: input.categoria }),
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

      // Costruisco l'elenco di TUTTI i tragitti-bersaglio di questo
      // salvataggio (liberi + di ogni servizio), con l'id VERO del
      // servizio già risolto — poi sincronizzo tutto insieme in un
      // solo passaggio (vedi sincronizzaTuttiITragitti sopra: guardare
      // un contesto alla volta faceva scambiare per eliminazioni vere
      // i tragitti che semplicemente cambiavano servizio).
      const bersagli: { servizioId: string | null; tragitto: z.infer<typeof tragittoSchema> }[] = [];

      if (input.tragitti) {
        for (const tragitto of input.tragitti.filter((l) => !l.servizioId)) bersagli.push({ servizioId: null, tragitto });
      }

      if (input.servizi) {
        const serviziEsistenti = await tx.select().from(servizi).where(eq(servizi.eventoId, id));
        const idsInviati = new Set(input.servizi.filter((p) => p.id).map((p) => p.id));

        // Un servizio rimasto fuori dal form viene eliminato — le sue
        // tratte, semplicemente non comparendo più tra i bersagli qui
        // sotto, verranno trattate come eliminazione vera dal
        // passaggio unico più avanti (stesso controllo prenotazioni).
        for (const esistente of serviziEsistenti) {
          if (idsInviati.has(esistente.id)) continue;
          await tx.delete(servizi).where(eq(servizi.id, esistente.id));
        }

        for (const servizio of input.servizi) {
          if (servizio.id) {
            await tx.update(servizi).set({ nome: servizio.nome, arrivoIndirizzo: servizio.arrivoIndirizzo, arrivoOrario: servizio.arrivoOrario }).where(eq(servizi.id, servizio.id));
            for (const tragitto of servizio.tragitti) bersagli.push({ servizioId: servizio.id, tragitto });
          } else {
            const [nuovoServizio] = await tx.insert(servizi).values({ eventoId: id, nome: servizio.nome, arrivoIndirizzo: servizio.arrivoIndirizzo, arrivoOrario: servizio.arrivoOrario }).returning();
            for (const tragitto of servizio.tragitti) bersagli.push({ servizioId: nuovoServizio.id, tragitto });
          }
        }
      }

      // Nota per chi tocca questo codice in futuro: la sincronizzazione
      // qui sotto presuppone che, quando il form invia i tragitti,
      // invii SEMPRE sia "tragitti" (i liberi) sia "servizi" insieme
      // (anche vuoti) — mai uno dei due senza l'altro. Oggi è così per
      // l'unico chiamante che li tocca (SchedaEventoModale); altri
      // aggiornamenti parziali (es. VetrinaScreen, che manda solo
      // inEvidenza) non includono né l'uno né l'altro, e per quelli la
      // condizione qui sotto salta tutto correttamente, senza toccare
      // nulla. Se in futuro un chiamante mandasse SOLO uno dei due,
      // l'altra categoria (mai menzionata) verrebbe vista come "sparita
      // da ogni bersaglio" e trattata per errore come eliminazione.
      if (input.tragitti || input.servizi) {
        await sincronizzaTuttiITragitti(tx, id, bersagli);
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
    const [conPrenotazioni] = await db.select({ id: prenotazioni.id }).from(prenotazioni)
      .where(and(eq(prenotazioni.eventoId, id), eq(prenotazioni.stato, 'CONFERMATA'))).limit(1);
    if (conPrenotazioni) {
      throw new ConflittoDati('Questo evento ha prenotazioni confermate — non può essere eliminato. Contatta i clienti o cancella prima le loro prenotazioni.');
    }
    await db.update(eventi).set({ eliminatoIl: new Date() }).where(eq(eventi.id, id));
  },

  /** Elenco eventi nel Cestino — solo quelli eliminati, con le tratte
   *  che avevano (anche loro nascoste normalmente, ma qui servono per
   *  farsi un'idea di cosa si sta per ripristinare). */
  async eventiEliminati() {
    return db.query.eventi.findMany({
      where: sql`${eventi.eliminatoIl} is not null`,
      with: { tragitti: true, immagini: true },
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
        id: tragitti.id,
        nome: tragitti.nome,
        eliminatoIl: tragitti.eliminatoIl,
        eventoId: tragitti.eventoId,
        eventoArtista: eventi.artista,
      })
      .from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(sql`${tragitti.eliminatoIl} is not null`)
      .orderBy(sql`${tragitti.eliminatoIl} desc`);
  },

  async ripristinaTratta(id: string) {
    const [tragitto] = await db.select().from(tragitti).where(eq(tragitti.id, id)).limit(1);
    if (!tragitto) throw new NonTrovato('Tratta');
    await db.update(tragitti).set({ eliminatoIl: null }).where(eq(tragitti.id, id));
  },

  /** Somma i posti disponibili su tutte le tragitti di un evento —
   *  liberi E dentro ogni servizio, stesso motivo delle altre funzioni
   *  qui sopra corrette allo stesso modo. */
  postiTotaliDisponibili(evento: Awaited<ReturnType<typeof getById>>) {
    return [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].reduce((somma, l) => somma + l.postiDisponibili, 0);
  },

  /** Una riga per ogni fermata prenotabile, con il prezzo effettivo già
   *  calcolato (sovrascrive prezzo base+extra se la fermata ha un prezzo
   *  proprio) — usata dal checkout sul sito pubblico. */
  async opzioniPartenza(eventoId: string, servizioId?: string) {
    const evento = await getById(eventoId);
    // Se l'evento ha servizi distinti e ne è stato scelto uno, le
    // fermate mostrate sono solo le sue — altrimenti (evento senza
    // servizi, o nessuno specificato) tutte quelle libere, come sempre.
    const tragittiDaMostrare = (servizioId
      ? evento.servizi.find((p) => p.id === servizioId)?.tragitti ?? []
      : evento.tragitti.filter((l) => !l.servizioId)
    ).filter((l) => l.attivo && l.stato === 'CONFERMATO'); // disattivato o "da confermare" (nessun bus vero ancora): non prenotabile
    const opzioni: Array<{
      tragittoId: string;
      postiDisponibili: number;
      fermataId: string;
      fermataCitta: string;
      fermataIndirizzo: string;
      fermataOrario: string | null;
      orarioRitorno: string | null;
      indirizzoRitorno: string | null;
      prezzoEffettivo: number;
    }> = [];

    for (const tragitto of tragittiDaMostrare) {
      // Nota: prima qui si saltava del tutto la tratta se il bus era
      // esaurito — ma così il cliente non aveva modo di scegliere PER
      // QUALE fermata mettersi in lista d'attesa (il menu restava vuoto).
      // Ora le fermate compaiono sempre, con posti disponibili a 0
      // quando è il caso: la scelta resta possibile, solo che porta
      // alla lista d'attesa invece che al pagamento.
      for (const f of tragitto.fermate) {
        const prezzoEffettivo = prezzoNormaleFermata(f, evento, tragitto);
        // Se questa fermata ha un limite posti suo (facoltativo), i suoi
        // posti disponibili sono il minore tra quanto le resta e quanto
        // resta sul bus in generale — così una fermata può esaurirsi da
        // sola anche se il bus nel complesso ha ancora posti altrove, ma
        // non può mai avere "più posti" di quelli davvero rimasti sul bus.
        const postiDisponibiliFermata = f.postiMax != null
          ? Math.min(tragitto.postiDisponibili, Math.max(0, f.postiMax - f.postiPrenotati))
          : tragitto.postiDisponibili;
        opzioni.push({
          tragittoId: tragitto.id,
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
   * Suggerisce quanti bus servono per ogni tragitto dell'evento, in base ai
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
    // Stesso identico problema già risolto altrove in questo file: qui
    // servono TUTTI i tragitti dell'evento, sia quelli liberi che quelli
    // di ogni servizio — evento.tragitti da solo (dopo la correzione
    // che esclude correttamente i tragitti già assegnati a un servizio,
    // per non farli comparire duplicati) non li conteneva più tutti.
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    const tragittiIds = tuttiITragitti.map((l) => l.id);

    const prenotazioniConfermate = await db
      .select({ tragittoId: prenotazioni.tragittoId, fermataCitta: prenotazioni.fermataCitta, passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));

    // Per calcolare la copertura reale servono i bus davvero censiti su
    // ogni tratta, con i loro posti (facoltativi: un bus senza posti
    // indicati non contribuisce alla somma, invece di essere ignorato
    // del tutto o contare come 0 posti per errore).
    const assegnazioni = tragittiIds.length ? await db.select().from(busTratte).where(inArray(busTratte.tragittoId, tragittiIds)) : [];
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const busCensiti = busIds.length ? await db.select().from(busFisici).where(inArray(busFisici.id, busIds)) : [];

    return tuttiITragitti.map((tragitto) => {
      const fermateOrdinate = [...tragitto.fermate].sort((a, b) => a.ordine - b.ordine);

      const fermateConPasseggeri = fermateOrdinate.map((f) => {
        const passeggeri = prenotazioniConfermate
          .filter((p) => p.tragittoId === tragitto.id && p.fermataCitta === f.citta)
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
        .filter((b) => assegnazioni.some((a) => a.busId === b.id && a.tragittoId === tragitto.id))
        .reduce((s, b) => s + (b.postiBus ?? 0), 0);
      const coperta = totalePasseggeri > 0 && postiBusCensiti >= totalePasseggeri;

      return {
        tragittoId: tragitto.id,
        servizioId: tragitto.servizioId,
        nome: tragitto.nome,
        stato: tragitto.stato,
        postiTotali: tragitto.postiTotali,
        capienzaPerBus: capienza,
        fermate: fermateConPasseggeri,
        totalePasseggeri,
        busSuggeriti,
        coperta,
        postiBusCensiti,
      };
    });
  },

  /** Bus fisici collegati a una qualunque tragitto dell'evento, con le tratte
   *  (tragitti) che ciascuno copre. */
  async listaBus(eventoId: string) {
    const evento = await getById(eventoId);
    const tragittiIds = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].map((l) => l.id);
    if (tragittiIds.length === 0) return [];

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.tragittoId, tragittiIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    if (busIds.length === 0) return [];

    const bus = await db.select().from(busFisici).where(inArray(busFisici.id, busIds));
    const tourLeaderIds = bus.map((b) => b.tourLeaderId).filter((id): id is string => id !== null);
    const tourLeaders = tourLeaderIds.length ? await db.select().from(tourLeader).where(inArray(tourLeader.id, tourLeaderIds)) : [];

    return bus.map((b) => {
      const tl = tourLeaders.find((t) => t.id === b.tourLeaderId);
      return {
        ...b,
        tragittiIds: assegnazioni.filter((a) => a.busId === b.id).map((a) => a.tragittoId),
        tourLeaderNome: tl ? `${tl.nome} ${tl.cognome}` : null,
      };
    });
  },

  /** Fase 2 — orario/prezzo/posti per fermata e per tragitto si
   *  modificano da qui (Partenze), non più da Eventi. A differenza del
   *  salvataggio completo dell'evento, questa aggiorna UN tragitto
   *  solo, senza dover rimandare tutto il payload — comodo per un
   *  editing rapido dalla scheda del tragitto in Partenze. Le fermate
   *  vengono sostituite per intero (elimina+ricrea, come già fa il
   *  salvataggio completo — non hanno prenotazioni collegate
   *  direttamente, le prenotazioni salvano città/indirizzo come
   *  testo, non un riferimento), quindi aggiungere/togliere una
   *  fermata solo per questa specifica partenza funziona già così
   *  com'è: basta mandare l'elenco nuovo. */
  async aggiornaTragittoOperativo(tragittoId: string, input: z.infer<typeof aggiornaTragittoOperativoSchema>) {
    const [esiste] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!esiste) throw new NonTrovato('Tragitto');

    // Rilevo le variazioni PRIMA di toccare il database — servono le
    // fermate vecchie vere per il confronto (vedi rilevaVariazioni).
    const fermateVecchie = await db.select().from(fermate).where(eq(fermate.tragittoId, tragittoId)).orderBy(fermate.ordine);
    const variazioniRilevate = await rilevaVariazioni(
      fermateVecchie.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario })),
      input.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario }))
    );

    await db.transaction(async (tx) => {
      // Stessa logica già in sincronizzaTuttiITragitti: i posti già
      // occupati (venduti) restano tali, i disponibili si aggiustano
      // della stessa quantità invece di essere resettati.
      const postiOccupati = esiste.postiTotali - esiste.postiDisponibili;
      const nuoviPostiDisponibili = Math.max(0, input.postiTotali - postiOccupati);
      await tx.update(tragitti).set({
        postiTotali: input.postiTotali,
        postiDisponibili: nuoviPostiDisponibili,
        prezzoExtra: input.prezzoExtra.toFixed(2),
      }).where(eq(tragitti.id, tragittoId));

      await tx.delete(fermate).where(eq(fermate.tragittoId, tragittoId));
      if (input.fermate.length) {
        await tx.insert(fermate).values(
          input.fermate.map((f, ordine) => ({
            tragittoId, ordine,
            fermataAnagraficaId: f.fermataAnagraficaId,
            citta: f.citta, indirizzo: f.indirizzo,
            orario: f.orario, orarioRitorno: f.orarioRitorno, indirizzoRitorno: f.indirizzoRitorno,
            postiMax: f.postiMax, prezzo: f.prezzo?.toFixed(2),
          }))
        );
      }
    });

    // Le comunicazioni partono SOLO dopo che il salvataggio è andato a
    // buon fine — non devono partire per un salvataggio poi fallito.
    await generaComunicazioniVariazione(tragittoId, variazioniRilevate);
  },

  async creaBus(eventoId: string, input: { fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string; costo?: number; postiBus?: number; note?: string; tragittiIds: string[] }) {
    const evento = await getById(eventoId);
    const lineeValide = new Set([...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].map((l) => l.id));
    const tragittiIdsFiltrate = input.tragittiIds.filter((id) => lineeValide.has(id));
    if (tragittiIdsFiltrate.length === 0) throw new ConflittoDati('Seleziona almeno una tratta di questo evento per il bus.');

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
      await tx.insert(busTratte).values(tragittiIdsFiltrate.map((tragittoId) => ({ busId: nuovo.id, tragittoId })));
      // Appena un tragitto ha almeno un bus vero registrato, passa da
      // "Da confermare" a "Confermato" — solo da lì può andare in
      // vendita (vedi opzioniPartenza, che filtra su questo stato).
      // Non tocca chi è già CONFERMATO (nessun downgrade, questo è un
      // solo passaggio in avanti).
      await tx.update(tragitti).set({ stato: 'CONFERMATO' }).where(and(inArray(tragitti.id, tragittiIdsFiltrate), eq(tragitti.stato, 'DA_CONFERMARE')));
      return nuovo.id;
    });
  },

  async aggiornaBus(eventoId: string, busId: string, input: { fornitoreId?: string; riferimento?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string; tragittiIds?: string[] }) {
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
      if (input.tragittiIds !== undefined) {
        const evento = await getById(eventoId);
        const lineeValide = new Set([...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].map((l) => l.id));
        const tragittiIdsFiltrate = input.tragittiIds.filter((id) => lineeValide.has(id));
        await tx.delete(busTratte).where(eq(busTratte.busId, busId));
        if (tragittiIdsFiltrate.length > 0) {
          await tx.insert(busTratte).values(tragittiIdsFiltrate.map((tragittoId) => ({ busId, tragittoId })));
          // Stessa auto-conferma di creaBus — assegnare un bus già
          // esistente a un tragitto ancora "da confermare" lo conferma
          // altrettanto, non serve passare per forza da un bus nuovo.
          await tx.update(tragitti).set({ stato: 'CONFERMATO' }).where(and(inArray(tragitti.id, tragittiIdsFiltrate), eq(tragitti.stato, 'DA_CONFERMARE')));
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
    const tragittiIds = assegnazioni.map((a) => a.tragittoId);
    if (tragittiIds.length === 0) return [];

    const righe = await db
      .select({
        prenotazioneId: prenotazioni.id,
        pnr: prenotazioni.pnr,
        fermataCitta: prenotazioni.fermataCitta,
        telefonoReferente: prenotazioni.referenteTelefono,
      })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA')));

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
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    const tragittiIds = tuttiITragitti.map((l) => l.id);
    if (tragittiIds.length === 0) return [];

    const prenotazioniConfermate = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: prenotazioni.totale })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA')));

    const assegnazioni = tragittiIds.length ? await db.select().from(busTratte).where(inArray(busTratte.tragittoId, tragittiIds)) : [];
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const bus = busIds.length ? await db.select().from(busFisici).where(inArray(busFisici.id, busIds)) : [];

    return tuttiITragitti.map((tragitto) => {
      const incassato = prenotazioniConfermate
        .filter((p) => p.tragittoId === tragitto.id)
        .reduce((s, p) => s + Number(p.totale), 0);

      const busIdsTratta = assegnazioni.filter((a) => a.tragittoId === tragitto.id).map((a) => a.busId);
      const busTratta = bus.filter((b) => busIdsTratta.includes(b.id));
      const costoCensito = busTratta.some((b) => b.costo !== null);
      const costo = busTratta.reduce((s, b) => s + (b.costo ? Number(b.costo) : 0), 0);

      return {
        tragittoId: tragitto.id,
        nome: tragitto.nome,
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
  /** Un tragitto ha prenotazioni confermate? Usata per avvisare subito
   *  al click su "Rimuovi tragitto", prima ancora di tentare il
   *  salvataggio — lo stesso identico controllo che il salvataggio fa
   *  comunque da solo (vedi sincronizzaTragitti), qui solo anticipato
   *  per dare un riscontro immediato invece di scoprirlo dopo. */
  async tragittoHaPrenotazioniConfermate(tragittoId: string): Promise<{ haPrenotazioni: boolean; quante: number }> {
    const righe = await db.select({ passeggeri: prenotazioni.passeggeri }).from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')));
    const quante = righe.reduce((somma, r) => somma + r.passeggeri, 0);
    return { haPrenotazioni: quante > 0, quante };
  },

  async statistichePerEvento(): Promise<Record<string, { partecipanti: number; busCensiti: number }>> {
    const righeTragitti = await db.select({ tragittoId: tragitti.id, eventoId: tragitti.eventoId }).from(tragitti);
    const mappaEventoDiTragitto = new Map(righeTragitti.map((r) => [r.tragittoId, r.eventoId]));

    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.tragittoId);

    const risultato: Record<string, { partecipanti: number; busCensiti: number }> = {};
    for (const s of somme) {
      const eventoId = mappaEventoDiTragitto.get(s.tragittoId);
      if (!eventoId) continue;
      risultato[eventoId] ??= { partecipanti: 0, busCensiti: 0 };
      risultato[eventoId].partecipanti += Number(s.totale);
    }

    const assegnazioni = await db.select().from(busTratte);
    const busPerEvento = new Map<string, Set<string>>();
    for (const a of assegnazioni) {
      const eventoId = mappaEventoDiTragitto.get(a.tragittoId);
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

  /** Quanti eventi (non passati) hanno almeno un tragitto ancora "da
   *  confermare" — nessun bus vero registrato, quindi non ancora in
   *  vendita. Badge dedicato nel menu di Partenze, per non doverli
   *  scoprire aprendo ogni evento uno per uno. */
  async contaEventiDaConfermare() {
    const righe = await db
      .select({ eventoId: tragitti.eventoId })
      .from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(eq(tragitti.stato, 'DA_CONFERMARE'), eq(tragitti.attivo, true), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
    return new Set(righe.map((r) => r.eventoId)).size;
  },

  async contaAllertePartenze() {
    const righeTragitti = await db.select({ tragittoId: tragitti.id }).from(tragitti);
    if (righeTragitti.length === 0) return 0;
    const tuttiTragittiIds = righeTragitti.map((r) => r.tragittoId);

    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.tragittoId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.tragittoId, Number(s.totale)]));

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.tragittoId, tuttiTragittiIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const bus = busIds.length ? await db.select({ id: busFisici.id, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.id, busIds)) : [];
    const mappaBus = new Map(bus.map((b) => [b.id, b.postiBus ?? 0]));

    let conteggio = 0;
    for (const tragittoId of tuttiTragittiIds) {
      const passeggeri = mappaPasseggeri.get(tragittoId) ?? 0;
      if (passeggeri === 0) continue; // niente da coprire, non è un allarme
      const postiBusCensiti = assegnazioni
        .filter((a) => a.tragittoId === tragittoId)
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
    const righeTragitti = await db.select({ tragittoId: tragitti.id, eventoId: tragitti.eventoId }).from(tragitti);
    if (righeTragitti.length === 0) return {};
    const tuttiTragittiIds = righeTragitti.map((r) => r.tragittoId);
    const mappaEventoDiTragitto = new Map(righeTragitti.map((r) => [r.tragittoId, r.eventoId]));

    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.tragittoId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.tragittoId, Number(s.totale)]));

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.tragittoId, tuttiTragittiIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    const bus = busIds.length ? await db.select({ id: busFisici.id, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.id, busIds)) : [];
    const mappaBus = new Map(bus.map((b) => [b.id, b.postiBus ?? 0]));

    const risultato: Record<string, number> = {};
    for (const tragittoId of tuttiTragittiIds) {
      const passeggeri = mappaPasseggeri.get(tragittoId) ?? 0;
      if (passeggeri === 0) continue;
      const postiBusCensiti = assegnazioni
        .filter((a) => a.tragittoId === tragittoId)
        .reduce((s, a) => s + (mappaBus.get(a.busId) ?? 0), 0);
      if (postiBusCensiti < passeggeri) {
        const eventoId = mappaEventoDiTragitto.get(tragittoId)!;
        risultato[eventoId] = (risultato[eventoId] ?? 0) + 1;
      }
    }
    return risultato;
  },
};
