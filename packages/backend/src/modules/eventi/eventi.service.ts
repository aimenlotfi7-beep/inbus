import { and, eq, ilike, inArray, isNull, sql, gte, lt } from 'drizzle-orm';
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
  linee,
  lineaFermate,
  tourLeader,
  utenti,
  partecipantiPrenotazione,
} from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { prezzoNormaleFermata } from '../../shared/prezzi.js';
import { leggiPostiPerBus } from '../impostazioni/impostazioni.routes.js';
import type { CreaEventoInput, AggiornaEventoInput, ListaEventiQuery } from './eventi.dto.js';
import { tragittoSchema, aggiornaTragittoOperativoSchema, registraPreventivoSchema } from './eventi.dto.js';
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

/** Ricalcola i posti totali di un tragitto dalla somma dei bus VERI
 *  registrati su di lui — non più un numero scritto a mano: la fonte
 *  di verità sono i bus censiti. I posti già occupati (venduti)
 *  restano tali, solo i disponibili si aggiustano di conseguenza —
 *  stessa logica già usata per gli altri aggiustamenti manuali. Va
 *  richiamata ogni volta che l'elenco bus di un tragitto cambia
 *  (registrato un bus nuovo, cambiati i posti di uno esistente,
 *  spostato o rimosso un bus da questo tragitto). */
// Usato quando un tragitto diventa prenotabile (preventivo registrato)
// ma non ha ancora nessun bus vero — le vendite non devono avere un
// tetto in quella fase (vedi registraPreventivo). Un numero enorme
// invece di un vero infinito: resta un intero valido nel database, e
// il sito non mostra comunque mai il numero esatto al cliente.
const POSTI_QUASI_ILLIMITATI = 999999;

async function ricalcolaPostiTragitto(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tragittoId: string) {
  // .for('update'): blocca la riga finché questa transazione non
  // finisce — se due admin toccano bus dello stesso tragitto nello
  // stesso istante, il secondo aspetta che il primo finisca invece di
  // leggere un valore "vecchio" di postiOccupati e sovrascrivere il
  // lavoro del primo. Stesso principio già usato per il blocco posti
  // nella prenotazione cliente (lì con un UPDATE...WHERE atomico,
  // equivalente ma diverso nella forma perché qui serve prima leggere
  // il valore attuale, non solo verificarlo).
  const [esiste] = await tx.select().from(tragitti).where(eq(tragitti.id, tragittoId)).for('update').limit(1);
  if (!esiste) return; // può capitare se il tragitto è stato eliminato nel frattempo — niente da ricalcolare
  const postiOccupati = esiste.postiTotali - esiste.postiDisponibili;
  // Solo il modello Linee — bus_tratte e bus_fermate (i due sistemi
  // precedenti) non ricevono più nessuna scrittura da nessuna parte
  // del codice: creaBus e la vecchia versione di creaLinea, le uniche
  // funzioni che ci scrivevano, non esistono più. Verificato vuoto sul
  // database vero prima di semplificare qui.
  const daLinee = await tx.select({ busId: busFisici.id }).from(busFisici)
    .innerJoin(linee, eq(linee.id, busFisici.lineaId))
    .where(eq(linee.tragittoId, tragittoId));
  const idBusUnici = new Set(daLinee.map((r) => r.busId));
  if (idBusUnici.size === 0) {
    // Nessun bus più collegato — se non c'era ancora nessuna
    // prenotazione confermata va benissimo (torna semplicemente senza
    // copertura), ma se ce ne sono già bloccare è l'unica scelta
    // sicura: azzerare i posti lascerebbe clienti paganti senza nessun
    // bus assegnato, senza nemmeno un avviso.
    if (postiOccupati > 0) throw new ConflittoDati(`Questo tragitto ha già ${postiOccupati} posti venduti — non puoi restare senza nessun bus che li copra. Registra prima un bus/Linea sostitutivo con capienza sufficiente.`);
    await tx.update(tragitti).set({ postiTotali: 0, postiDisponibili: 0 }).where(eq(tragitti.id, tragittoId));
    return;
  }
  const bus = await tx.select({ postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.id, [...idBusUnici]));
  const nuovoTotale = bus.reduce((somma, r) => somma + (r.postiBus ?? 0), 0);
  // Stessa protezione: la nuova capienza non può mai scendere sotto
  // quanto già venduto, altrimenti postiTotali diventerebbe più basso
  // dei posti occupati — un'incoerenza che non dovrebbe mai esistere.
  if (nuovoTotale < postiOccupati) throw new ConflittoDati(`La nuova capienza (${nuovoTotale} posti) è inferiore ai ${postiOccupati} posti già venduti su questo tragitto — aumenta i posti dei bus coinvolti, o aggiungine un altro, prima di procedere.`);
  await tx.update(tragitti).set({
    postiTotali: nuovoTotale,
    postiDisponibili: Math.max(0, nuovoTotale - postiOccupati),
  }).where(eq(tragitti.id, tragittoId));
}

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
  tragitti: { postiTotali: number; postiDisponibili: number; attivo: boolean; stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO' }[];
  servizi: { tragitti: { postiTotali: number; postiDisponibili: number; attivo: boolean; stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO' }[] }[];
}>(evento: T): T {
  if (evento.statoDisponibilita) return evento; // scelta manuale, ha sempre la precedenza
  // Il calcolo considera SIA i tragitti liberi SIA quelli di ogni
  // servizio (altrimenti un evento a servizi, dove i tragitti veri
  // vivono tutti dentro i servizi, risulterebbe sempre senza dati per
  // il calcolo automatico) — ma il campo "tragitti" restituito al sito
  // resta quello originale, invariato: il frontend li combina già da
  // solo dove serve, sommarli anche qui li farebbe contare due volte.
  // Un tragitto disattivato o ancora "da confermare" (nessun preventivo,
  // non in vendita) non contribuisce — ma "Prezzato" sì, è già in
  // vendita esattamente come "Confermato", solo senza ancora un bus
  // vero opzionato con un fornitore.
  const tuttiPerIlCalcolo = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].filter((t) => t.attivo && t.stato !== 'DA_CONFERMARE');
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
      arrivoIndirizzo: tragitto.arrivoIndirizzo,
      arrivoOrario: tragitto.arrivoOrario,
      arrivoCitta: tragitto.arrivoCitta,
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
        sogliaMinima: f.sogliaMinima,
        attivo: f.attivo,
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
        arrivoIndirizzo: tragitto.arrivoIndirizzo,
        arrivoOrario: tragitto.arrivoOrario,
        arrivoCitta: tragitto.arrivoCitta,
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
            sogliaMinima: f.sogliaMinima,
            attivo: f.attivo,
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
        .where(and(inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']), eq(tragitti.attivo, true)));
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
    if (!tuttiITragitti.some((t) => t.attivo && t.stato !== 'DA_CONFERMARE')) throw new NonTrovato('Evento');
    return conStatoCalcolato(evento);
  },

  async create(input: CreaEventoInput) {
    // Blocca la creazione di un evento "gemello" — stesso artista,
    // stessa data — che quasi sempre è un doppione creato per errore
    // (doppio click, tentativo ripetuto dopo un errore di rete che in
    // realtà era andato a buon fine) più che un evento voluto davvero
    // due volte nello stesso giorno. Confronto sul solo GIORNO (non
    // l'orario preciso), case-insensitive sul nome artista.
    const giornoInizio = new Date(input.data); giornoInizio.setHours(0, 0, 0, 0);
    const giornoFine = new Date(giornoInizio); giornoFine.setDate(giornoFine.getDate() + 1);
    const [doppione] = await db.select({ id: eventi.id }).from(eventi)
      .where(and(
        isNull(eventi.eliminatoIl),
        ilike(eventi.artista, input.artista.trim()),
        gte(eventi.data, giornoInizio),
        lt(eventi.data, giornoFine),
      )).limit(1);
    if (doppione) throw new ConflittoDati(`Esiste già un evento "${input.artista}" in questa stessa data — se non è un errore, cambia leggermente il nome o la data per distinguerli.`);

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
          eventoId: nuovoEvento.id, nome: servizio.nome,
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
            await tx.update(servizi).set({ nome: servizio.nome }).where(eq(servizi.id, servizio.id));
            for (const tragitto of servizio.tragitti) bersagli.push({ servizioId: servizio.id, tragitto });
          } else {
            const [nuovoServizio] = await tx.insert(servizi).values({ eventoId: id, nome: servizio.nome }).returning();
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
    ).filter((l) => l.attivo && l.stato !== 'DA_CONFERMARE'); // disattivato o "da confermare" (nessun preventivo ancora): non prenotabile
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
      // Solo per una fermata "Partenza" — visibile al cliente, così
      // sa che quella fermata specifica ha bisogno di un minimo di
      // conferme prima di essere garantita (vedi le Linee, ancora da
      // costruire — questo è il dato che il cliente deve poter vedere
      // già da ora, indipendentemente da quando arriva quella parte).
      sogliaMinima: number | null;
      partecipantiAttuali: number | null;
    }> = [];

    // Una sola query per TUTTE le fermate con una soglia minima
    // impostata, di tutti i tragitti mostrati — prima girava dentro il
    // ciclo, una query per ogni fermata (N+1, lento se un evento ha
    // molte fermate). Facoltativa su OGNI fermata ora (prima solo su
    // quelle marcate "Partenza", un concetto tolto insieme al campo
    // "tipo" — la sola presenza di una soglia scritta basta a dire che
    // va controllata).
    const fermateConSoglia = tragittiDaMostrare.flatMap((t) => t.fermate.filter((f) => f.sogliaMinima != null).map((f) => ({ tragittoId: t.id, citta: f.citta })));
    const contiPartenza = new Map<string, number>(); // chiave: `${tragittoId}::${citta}`
    if (fermateConSoglia.length > 0) {
      const righe = await db.select({
        tragittoId: prenotazioni.tragittoId,
        citta: prenotazioni.fermataCitta,
        tot: sql<number>`coalesce(sum(${prenotazioni.passeggeri}), 0)`,
      }).from(prenotazioni)
        .where(and(inArray(prenotazioni.tragittoId, [...new Set(fermateConSoglia.map((f) => f.tragittoId))]), eq(prenotazioni.stato, 'CONFERMATA')))
        .groupBy(prenotazioni.tragittoId, prenotazioni.fermataCitta);
      for (const r of righe) contiPartenza.set(`${r.tragittoId}::${r.citta}`, Number(r.tot));
    }

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
        const partecipantiAttuali = f.sogliaMinima != null ? (contiPartenza.get(`${tragitto.id}::${f.citta}`) ?? 0) : null;
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
          sogliaMinima: f.sogliaMinima,
          partecipantiAttuali,
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

    const prenotazioniConfermate = await db
      .select({ tragittoId: prenotazioni.tragittoId, fermataCitta: prenotazioni.fermataCitta, passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));

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

      // Coperta = automatico, non più un interruttore da cliccare: usa
      // direttamente postiTotali del tragitto (già mantenuto corretto
      // da ricalcolaPostiTragitto, che considera già ogni bus/Linea
      // registrata) — prima questa funzione lo ricalcolava DA SOLA con
      // una propria query, guardando solo bus_tratte: un bus registrato
      // tramite una Linea (bus_fermate o il contenitore) non veniva
      // considerato, un'incoerenza mai notata finché non è rimasta
      // l'unica strada davvero in uso.
      const coperta = totalePasseggeri > 0 && tragitto.postiTotali >= totalePasseggeri;

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
        postiBusCensiti: tragitto.postiTotali,
      };
    });
  },

  /** Bus fisici collegati a una qualunque tragitto dell'evento, con le tratte
   *  (tragitti) che ciascuno copre. */
  async listaBus(eventoId: string) {
    const evento = await getById(eventoId);
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    const tragittiIds = tuttiITragitti.map((l) => l.id);
    if (tragittiIds.length === 0) return [];

    const lineeDiQuestiTragitti = await db.select().from(linee).where(inArray(linee.tragittoId, tragittiIds));
    const lineaIds = lineeDiQuestiTragitti.map((l) => l.id);
    if (lineaIds.length === 0) return [];
    const busDaLinee = await db.select().from(busFisici).where(inArray(busFisici.lineaId, lineaIds));
    const fermateDelleLinee = await db.select().from(lineaFermate).where(inArray(lineaFermate.lineaId, lineaIds));
    const mappaLineaTragitto = new Map(lineeDiQuestiTragitti.map((l) => [l.id, l.tragittoId]));

    const tourLeaderIds = busDaLinee.map((b) => b.tourLeaderId).filter((id): id is string => id !== null);
    const tourLeaders = tourLeaderIds.length ? await db.select().from(tourLeader).where(inArray(tourLeader.id, tourLeaderIds)) : [];

    return busDaLinee.map((b) => {
      const tl = tourLeaders.find((t) => t.id === b.tourLeaderId);
      const fermateIds = b.lineaId ? fermateDelleLinee.filter((f) => f.lineaId === b.lineaId).map((f) => f.fermataId) : [];
      const tragittoIdDaLinea = b.lineaId ? mappaLineaTragitto.get(b.lineaId) : undefined;
      return {
        ...b,
        tragittiIds: tragittoIdDaLinea ? [tragittoIdDaLinea] : [],
        fermateIds,
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
      // I posti non si toccano più qui — restano quelli calcolati dai
      // bus registrati (vedi ricalcolaPostiTragitto, chiamata dai
      // punti che toccano davvero i bus: creaBus/aggiornaBus/rimuoviBus).
      await tx.update(tragitti).set({
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
            sogliaMinima: f.sogliaMinima, attivo: f.attivo,
          }))
        );
      }
    });

    // Le comunicazioni partono SOLO dopo che il salvataggio è andato a
    // buon fine — non devono partire per un salvataggio poi fallito.
    await generaComunicazioniVariazione(tragittoId, variazioniRilevate);
  },

  /** Registra il preventivo (stima dal fornitore, sullo scenario più
   *  caro) e salva i prezzi già calcolati per ogni fermata — sblocca la
   *  vendita (stato "Prezzato") senza bisogno di un bus vero opzionato,
   *  che arriva solo dopo, quando le prenotazioni chiariscono da dove
   *  costruire la prima Linea vera. */
  async registraPreventivo(tragittoId: string, input: z.infer<typeof registraPreventivoSchema>) {
    const [esiste] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!esiste) throw new NonTrovato('Tragitto');

    await db.transaction(async (tx) => {
      await tx.update(tragitti).set({
        preventivoCosto: input.preventivoCosto.toFixed(2),
        preventivoPostiBus: input.preventivoPostiBus,
        // Solo un passaggio in avanti — non tocca un tragitto già
        // "Confermato" (avrebbe un bus vero, non ha senso retrocederlo).
        ...(esiste.stato === 'DA_CONFERMARE' && { stato: 'PREZZATO' as const }),
      }).where(eq(tragitti.id, tragittoId));

      for (const { fermataId, prezzo } of input.prezziPerFermata) {
        await tx.update(fermate).set({ prezzo: prezzo.toFixed(2) })
          .where(and(eq(fermate.id, fermataId), eq(fermate.tragittoId, tragittoId))); // il secondo controllo è una sicurezza in più, non fidarsi di un id passato dal client senza verificarlo
      }

      // Da qui il tragitto è prenotabile sul sito — ma se non c'è
      // ancora nessun bus vero registrato in una Linea, le vendite non
      // devono essere limitate: il numero "posti presunti" scritto nel
      // preventivo qui sopra è solo reportistica, non un tetto alle
      // vendite (deciso esplicitamente così — si vende prima, si
      // decidono i bus vengono dopo in base a quanto si è venduto).
      // "Quasi illimitato" invece di un vero infinito: il sito comunque
      // non mostra mai il numero esatto (solo "Posti disponibili"/
      // "Pochi posti"/"Esaurito" a soglie — vedi PercorsoBus.tsx), un
      // numero enorme si comporta a tutti gli effetti come nessun
      // limite, restando comunque un intero valido nel database.
      const daLinee = await tx.select({ busId: busFisici.id }).from(busFisici)
        .innerJoin(linee, eq(linee.id, busFisici.lineaId))
        .where(eq(linee.tragittoId, tragittoId));
      if (daLinee.length === 0) {
        const postiOccupati = esiste.postiTotali - esiste.postiDisponibili;
        await tx.update(tragitti).set({
          postiTotali: POSTI_QUASI_ILLIMITATI,
          postiDisponibili: POSTI_QUASI_ILLIMITATI - postiOccupati,
        }).where(eq(tragitti.id, tragittoId));
      }
    });
  },

  async creaLinea(eventoId: string, input: { riferimento: string; fornitoreId?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string; costo?: number; postiBus: number; note?: string; fermateIds: string[] }) {
    const evento = await getById(eventoId);
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    const tutteLeFermate = tuttiITragitti.flatMap((t) => t.fermate);
    const fermateScelte = tutteLeFermate.filter((f) => input.fermateIds.includes(f.id));
    if (fermateScelte.length === 0) throw new ConflittoDati('Seleziona almeno una fermata per la Linea.');
    // Tutte le fermate scelte devono appartenere allo STESSO tragitto —
    // una Linea copre un percorso solo, non un misto di tragitti diversi.
    const tragittoDelleFermate = tuttiITragitti.find((t) => t.fermate.some((f) => f.id === fermateScelte[0].id));
    if (!tragittoDelleFermate) throw new NonTrovato('Tragitto');
    const idsValideDelTragitto = new Set(tragittoDelleFermate.fermate.map((f) => f.id));
    if (!fermateScelte.every((f) => idsValideDelTragitto.has(f.id))) {
      throw new ConflittoDati('Tutte le fermate di una Linea devono appartenere allo stesso tragitto.');
    }
    // Ordinate per ORARIO (non per come sono state cliccate) — HH:MM
    // si ordina correttamente anche come testo puro. Le fermate senza
    // orario finiscono in fondo, nell'ordine in cui erano nel tragitto.
    const fermateOrdinate = [...fermateScelte].sort((a, b) => {
      if (!a.orario && !b.orario) return 0;
      if (!a.orario) return 1;
      if (!b.orario) return -1;
      return a.orario.localeCompare(b.orario);
    });

    return db.transaction(async (tx) => {
      const lineeEsistenti = await tx.select().from(linee).where(eq(linee.tragittoId, tragittoDelleFermate.id));
      const [nuovaLinea] = await tx.insert(linee).values({
        tragittoId: tragittoDelleFermate.id,
        nome: `Linea ${lineeEsistenti.length + 1}`,
        ordine: lineeEsistenti.length,
      }).returning();
      await tx.insert(lineaFermate).values(fermateOrdinate.map((f, ordine) => ({ lineaId: nuovaLinea.id, fermataId: f.id, ordine })));

      const [nuovoBus] = await tx.insert(busFisici).values({
        lineaId: nuovaLinea.id,
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        tourLeaderId: input.tourLeaderId,
        costo: input.costo?.toFixed(2),
        postiBus: input.postiBus,
        note: input.note,
      }).returning();

      await tx.update(tragitti).set({ stato: 'CONFERMATO' }).where(and(eq(tragitti.id, tragittoDelleFermate.id), inArray(tragitti.stato, ['DA_CONFERMARE', 'PREZZATO'])));
      await ricalcolaPostiTragitto(tx, tragittoDelleFermate.id);
      return { lineaId: nuovaLinea.id, busId: nuovoBus.id };
    });
  },

  /** Aggiunge un ULTERIORE bus a una Linea già esistente — stesse
   *  fermate della Linea (non si ridefiniscono), solo un bus in più
   *  per assorbire più prenotazioni sulle stesse fermate. */
  async aggiungiBusALinea(lineaId: string, input: { riferimento: string; fornitoreId?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string; costo?: number; postiBus: number; note?: string }) {
    const [lineaEsiste] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
    if (!lineaEsiste) throw new NonTrovato('Linea');

    return db.transaction(async (tx) => {
      const [nuovoBus] = await tx.insert(busFisici).values({
        lineaId,
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        tourLeaderId: input.tourLeaderId,
        costo: input.costo?.toFixed(2),
        postiBus: input.postiBus,
        note: input.note,
      }).returning();
      await ricalcolaPostiTragitto(tx, lineaEsiste.tragittoId);
      return nuovoBus.id;
    });
  },

  /** Modifica il percorso (le fermate) di una Linea intera — cambia
   *  per TUTTI i bus che ci sono dentro, dato che condividono lo stesso
   *  percorso per definizione. */
  async aggiornaPercorsoLinea(eventoId: string, lineaId: string, fermateIds: string[]) {
    const [lineaEsiste] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
    if (!lineaEsiste) throw new NonTrovato('Linea');
    const evento = await getById(eventoId);
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    const tragittoVero = tuttiITragitti.find((t) => t.id === lineaEsiste.tragittoId);
    if (!tragittoVero) throw new NonTrovato('Tragitto');
    const fermateScelte = tragittoVero.fermate.filter((f) => fermateIds.includes(f.id));
    if (fermateScelte.length === 0) throw new ConflittoDati('Seleziona almeno una fermata per la Linea.');
    const fermateOrdinate = [...fermateScelte].sort((a, b) => {
      if (!a.orario && !b.orario) return 0;
      if (!a.orario) return 1;
      if (!b.orario) return -1;
      return a.orario.localeCompare(b.orario);
    });

    return db.transaction(async (tx) => {
      await tx.delete(lineaFermate).where(eq(lineaFermate.lineaId, lineaId));
      await tx.insert(lineaFermate).values(fermateOrdinate.map((f, ordine) => ({ lineaId, fermataId: f.id, ordine })));
      await ricalcolaPostiTragitto(tx, lineaEsiste.tragittoId);
    });
  },

  /** Modifica i dati di UN singolo bus dentro una Linea (autista,
   *  posti, costo...) — non tocca il percorso, che è della Linea
   *  intera, non del singolo bus. */
  async aggiornaBusDiLinea(busId: string, input: { riferimento?: string; fornitoreId?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string }) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');
    return db.transaction(async (tx) => {
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
      if (input.postiBus !== undefined && bus.lineaId) {
        const [lineaVera] = await tx.select().from(linee).where(eq(linee.id, bus.lineaId)).limit(1);
        if (lineaVera) await ricalcolaPostiTragitto(tx, lineaVera.tragittoId);
      }
    });
  },

  /** Tutte le Linee di un tragitto, ognuna coi suoi bus e le sue
   *  fermate (già ordinate per orario) — la vista usata dalla pagina
   *  dedicata alle Linee. */
  async listaLinee(tragittoId: string) {
    const righeLinee = await db.select().from(linee).where(eq(linee.tragittoId, tragittoId)).orderBy(linee.ordine);
    if (righeLinee.length === 0) return [];
    const lineaIds = righeLinee.map((l) => l.id);

    const righeFermate = await db.select({
      lineaId: lineaFermate.lineaId, fermataId: lineaFermate.fermataId, ordine: lineaFermate.ordine,
      citta: fermate.citta, orario: fermate.orario,
    }).from(lineaFermate)
      .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
      .where(inArray(lineaFermate.lineaId, lineaIds))
      .orderBy(lineaFermate.ordine);

    const tuttiIBus = await db.select().from(busFisici).where(inArray(busFisici.lineaId, lineaIds));
    const tourLeaderIds = tuttiIBus.map((b) => b.tourLeaderId).filter((id): id is string => id !== null);
    const tourLeaders = tourLeaderIds.length ? await db.select().from(tourLeader).where(inArray(tourLeader.id, tourLeaderIds)) : [];

    // Prima "in attesa" (senza bus, valgono per l'intero tragitto,
    // uguali qualunque Linea le mostri) e "versate" (con un bus di
    // QUESTA Linea specifica — un'altra Linea diversa avrebbe le sue).
    const tutte = await db.select({ fermataCitta: prenotazioni.fermataCitta, busId: prenotazioni.busId, passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')));
    const mappaInAttesa = new Map<string, number>();
    // Chiave "lineaId::citta" — un bus appartiene sempre a una sola
    // Linea, quindi risalgo da busId a lineaId tramite tuttiIBus.
    const mappaVersati = new Map<string, number>();
    const lineaDiBus = new Map(tuttiIBus.map((b) => [b.id, b.lineaId]));
    for (const p of tutte) {
      if (!p.busId) {
        mappaInAttesa.set(p.fermataCitta, (mappaInAttesa.get(p.fermataCitta) ?? 0) + p.passeggeri);
        continue;
      }
      const lineaDiQuestoBus = lineaDiBus.get(p.busId);
      if (!lineaDiQuestoBus) continue; // bus di un altro tragitto/evento, non dovrebbe capitare
      const chiave = `${lineaDiQuestoBus}::${p.fermataCitta}`;
      mappaVersati.set(chiave, (mappaVersati.get(chiave) ?? 0) + p.passeggeri);
    }

    return righeLinee.map((l) => ({
      id: l.id,
      nome: l.nome,
      fermate: righeFermate.filter((f) => f.lineaId === l.id).map((f) => ({
        fermataId: f.fermataId, citta: f.citta, orario: f.orario,
        inAttesa: mappaInAttesa.get(f.citta) ?? 0,
        versati: mappaVersati.get(`${l.id}::${f.citta}`) ?? 0,
      })),
      bus: tuttiIBus.filter((b) => b.lineaId === l.id).map((b) => ({
        ...b,
        tourLeaderNome: (() => {
          const tl = tourLeaders.find((t) => t.id === b.tourLeaderId);
          return tl ? `${tl.nome} ${tl.cognome}` : null;
        })(),
      })),
    }));
  },

  /** "Versa" tutte le prenotazioni ancora in attesa (confermate, senza
   *  bus) sui bus di questa Linea — una volta sola, per tutte le
   *  fermate coperte insieme. Sceglie da sola quali prenotazioni
   *  specifiche versare per prima (le più vecchie), riempiendo un bus
   *  prima di passare al successivo — stessa logica già usata dallo
   *  scheduler automatico per età (24h prima della partenza), solo
   *  con un criterio diverso (anzianità della prenotazione, non età
   *  del passeggero) e attivata a mano invece che in automatico.
   *
   *  Il limite "posti max" di una fermata specifica non serve
   *  ricontrollarlo qui: è già garantito al momento della
   *  prenotazione (il checkout blocca chi supererebbe quel limite),
   *  quindi le prenotazioni "in attesa" non possono mai essere più di
   *  quante quel limite ne permetta. */
  async versaLinea(lineaId: string) {
    const [lineaRiga] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
    if (!lineaRiga) throw new NonTrovato('Linea');

    const bus = await db.select({ id: busFisici.id, postiBus: busFisici.postiBus }).from(busFisici)
      .where(eq(busFisici.lineaId, lineaId)).orderBy(busFisici.id);
    if (bus.length === 0) throw new ConflittoDati('Questa Linea non ha ancora nessun bus — aggiungine uno prima di versare.');

    const fermateCoperte = await db.select({ citta: fermate.citta }).from(lineaFermate)
      .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
      .where(eq(lineaFermate.lineaId, lineaId));
    if (fermateCoperte.length === 0) return { versate: 0, restanoInAttesa: 0 };

    // Posti già occupati su ogni bus — prenotazioni versate in un giro
    // precedente (di questa stessa funzione, o dello scheduler età).
    const busIds = bus.map((b) => b.id);
    const giaAssegnati = await db.select({ busId: prenotazioni.busId, passeggeri: prenotazioni.passeggeri }).from(prenotazioni)
      .where(and(inArray(prenotazioni.busId, busIds), eq(prenotazioni.stato, 'CONFERMATA')));
    const postiOccupati = new Map<string, number>();
    for (const r of giaAssegnati) {
      if (!r.busId) continue;
      postiOccupati.set(r.busId, (postiOccupati.get(r.busId) ?? 0) + r.passeggeri);
    }

    // Tutte le prenotazioni in attesa (senza bus) su TUTTE le fermate
    // coperte da questa Linea insieme, le più vecchie prima — non una
    // fermata alla volta: la capienza dei bus è condivisa tra tutte le
    // fermate che coprono, quindi va gestita insieme.
    const cittaCoperte = fermateCoperte.map((f) => f.citta);
    const inAttesa = await db.select().from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, lineaRiga.tragittoId), inArray(prenotazioni.fermataCitta, cittaCoperte), eq(prenotazioni.stato, 'CONFERMATA'), isNull(prenotazioni.busId)))
      .orderBy(prenotazioni.creataIl);

    let busCorrente = 0;
    let postiRimasti = (bus[0]?.postiBus ?? 0) - (postiOccupati.get(bus[0]?.id) ?? 0);
    let versate = 0;
    for (const p of inAttesa) {
      while (busCorrente < bus.length - 1 && postiRimasti <= 0) {
        busCorrente++;
        postiRimasti = (bus[busCorrente]?.postiBus ?? 0) - (postiOccupati.get(bus[busCorrente]?.id) ?? 0);
      }
      if (postiRimasti <= 0) break; // tutti i bus della Linea sono pieni — il resto resta in attesa
      await db.update(prenotazioni).set({ busId: bus[busCorrente].id }).where(eq(prenotazioni.id, p.id));
      postiRimasti -= p.passeggeri;
      versate++;
    }
    return { versate, restanoInAttesa: inAttesa.length - versate };
  },

  async rimuoviBus(busId: string) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');
    // Quale tragitto perde questo bus — serve per ricalcolarlo DOPO
    // l'eliminazione.
    const tragittiCollegati = bus.lineaId
      ? (await db.select({ tragittoId: linee.tragittoId }).from(linee).where(eq(linee.id, bus.lineaId))).map((r) => r.tragittoId)
      : [];
    await db.transaction(async (tx) => {
      await tx.delete(busFisici).where(eq(busFisici.id, busId));
      for (const tragittoId of tragittiCollegati) await ricalcolaPostiTragitto(tx, tragittoId);
    });
  },

  /** Elenco passeggeri (per la "lista tipo Excel" da dare al tour leader)
   *  per un bus specifico: tutti i partecipanti delle prenotazioni
   *  CONFERMATA sulle tratte coperte da quel bus. */
  async listaPasseggeriBus(busId: string) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');
    if (!bus.lineaId) return []; // bus non ancora collegato a nessuna Linea

    const [lineaVera] = await db.select().from(linee).where(eq(linee.id, bus.lineaId)).limit(1);
    if (!lineaVera) return [];
    // Le fermate coperte da QUESTA Linea — un bus non copre per forza
    // tutto il tragitto, solo le fermate specifiche della sua Linea
    // (prima questa funzione guardava l'intero tragitto tramite
    // bus_tratte, un sistema ormai senza più nessuna scrittura: per un
    // bus registrato tramite una Linea sarebbe sempre tornata vuota).
    const righeFermate = await db.select({ citta: fermate.citta }).from(lineaFermate)
      .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
      .where(eq(lineaFermate.lineaId, bus.lineaId));
    const cittaCoperte = righeFermate.map((f) => f.citta);
    if (cittaCoperte.length === 0) return [];

    const righe = await db
      .select({
        prenotazioneId: prenotazioni.id,
        pnr: prenotazioni.pnr,
        fermataCitta: prenotazioni.fermataCitta,
        telefonoReferente: prenotazioni.referenteTelefono,
      })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, lineaVera.tragittoId), inArray(prenotazioni.fermataCitta, cittaCoperte), eq(prenotazioni.stato, 'CONFERMATA')));

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

  /** Incassato, costo bus e guadagno per ogni tratta dell'evento (come
   *  già faceva) — E ANCHE il dettaglio per singola Linea dentro
   *  quella tratta (una tratta con più Linee, es. una da Milano e una
   *  da Reggio Emilia con costi diversi, altrimenti mostrerebbe solo
   *  un numero aggregato, impossibile capire quale delle due Linee
   *  guadagna di più). L'incassato di ogni Linea conta solo le
   *  prenotazioni sulle città che quella Linea copre davvero — un
   *  bus copre sempre una tratta sola, come deciso, ma una tratta può
   *  avere più Linee. */
  async riepilogoEconomico(eventoId: string) {
    const evento = await getById(eventoId);
    const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
    const tragittiIds = tuttiITragitti.map((l) => l.id);
    if (tragittiIds.length === 0) return [];

    const prenotazioniConfermate = await db
      .select({ tragittoId: prenotazioni.tragittoId, fermataCitta: prenotazioni.fermataCitta, totale: prenotazioni.totale })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA')));

    const tutteLeLinee = tragittiIds.length ? await db.select().from(linee).where(inArray(linee.tragittoId, tragittiIds)) : [];
    const lineeIds = tutteLeLinee.map((l) => l.id);
    const tutteLeFermateDiLinea = lineeIds.length
      ? await db.select({ lineaId: lineaFermate.lineaId, citta: fermate.citta }).from(lineaFermate)
        .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
        .where(inArray(lineaFermate.lineaId, lineeIds))
      : [];
    const bus = lineeIds.length ? await db.select().from(busFisici).where(inArray(busFisici.lineaId, lineeIds)) : [];

    return tuttiITragitti.map((tragitto) => {
      const incassato = prenotazioniConfermate
        .filter((p) => p.tragittoId === tragitto.id)
        .reduce((s, p) => s + Number(p.totale), 0);

      const lineeTratta = tutteLeLinee.filter((l) => l.tragittoId === tragitto.id);
      const perLinea = lineeTratta.map((l) => {
        const cittaLinea = new Set(tutteLeFermateDiLinea.filter((f) => f.lineaId === l.id).map((f) => f.citta));
        const incassatoLinea = prenotazioniConfermate
          .filter((p) => p.tragittoId === tragitto.id && cittaLinea.has(p.fermataCitta))
          .reduce((s, p) => s + Number(p.totale), 0);
        const busLinea = bus.filter((b) => b.lineaId === l.id);
        const costoCensitoLinea = busLinea.some((b) => b.costo !== null);
        const costoLinea = busLinea.reduce((s, b) => s + (b.costo ? Number(b.costo) : 0), 0);
        return {
          lineaId: l.id, lineaNome: l.nome,
          incassato: incassatoLinea, costo: costoLinea, costoCensito: costoCensitoLinea,
          guadagno: incassatoLinea - costoLinea,
        };
      });

      const busIdsTratta = bus.filter((b) => lineeTratta.some((l) => l.id === b.lineaId)).map((b) => b.id);
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
        perLinea,
      };
    });
  },

  /** Prenotazioni confermate per fermata di UN tragitto specifico — il
   *  totale attuale (per capire dove si sono già accumulate abbastanza
   *  persone) e l'andamento giorno per giorno (cumulativo, non il
   *  delta del giorno — serve a vedere il RITMO con cui arrivano, non
   *  solo il totale di adesso). Usato dal Cruscotto Vendite (dentro
   *  "Da Confermare") per decidere se/come dividere un tragitto in
   *  più Linee. */
  async venditePerFermata(tragittoId: string) {
    const [tragitto] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!tragitto) throw new NonTrovato('Tragitto');

    const righe = await db.select({
      citta: prenotazioni.fermataCitta,
      passeggeri: prenotazioni.passeggeri,
      creataIl: prenotazioni.creataIl,
    }).from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')))
      .orderBy(prenotazioni.creataIl);

    const perFermata = new Map<string, number>();
    for (const r of righe) perFermata.set(r.citta, (perFermata.get(r.citta) ?? 0) + r.passeggeri);

    // Andamento cumulativo per giorno E per città — una riga per ogni
    // combinazione (giorno, città) con il totale accumulato FINO A
    // FINE di quel giorno (non una riga per ogni singola prenotazione,
    // che con più prenotazioni lo stesso giorno darebbe righe
    // ridondanti) — il frontend disegna una linea per città usando
    // queste righe, senza dover ricalcolare nulla.
    const cumulativoPerCitta = new Map<string, number>();
    const cumulativoPerGiornoECitta = new Map<string, number>(); // chiave: "giorno::citta"
    for (const r of righe) {
      const giorno = r.creataIl.toISOString().slice(0, 10); // YYYY-MM-DD
      const nuovoCumulativo = (cumulativoPerCitta.get(r.citta) ?? 0) + r.passeggeri;
      cumulativoPerCitta.set(r.citta, nuovoCumulativo);
      cumulativoPerGiornoECitta.set(`${giorno}::${r.citta}`, nuovoCumulativo);
    }
    const andamento = [...cumulativoPerGiornoECitta.entries()]
      .map(([chiave, cumulativo]) => {
        const [data, citta] = chiave.split('::');
        return { data, citta, cumulativo };
      })
      .sort((a, b) => a.data.localeCompare(b.data));

    return {
      perFermata: [...perFermata.entries()].map(([citta, confermati]) => ({ citta, confermati })),
      andamento,
    };
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

    const lineeConTragitto = await db.select({ lineaId: linee.id, eventoId: tragitti.eventoId }).from(linee)
      .innerJoin(tragitti, eq(tragitti.id, linee.tragittoId));
    const mappaEventoDiLinea = new Map(lineeConTragitto.map((l) => [l.lineaId, l.eventoId]));
    const tuttiIBus = lineeConTragitto.length ? await db.select({ id: busFisici.id, lineaId: busFisici.lineaId }).from(busFisici).where(inArray(busFisici.lineaId, lineeConTragitto.map((l) => l.lineaId))) : [];
    const busPerEvento = new Map<string, Set<string>>();
    for (const b of tuttiIBus) {
      const eventoId = b.lineaId ? mappaEventoDiLinea.get(b.lineaId) : undefined;
      if (!eventoId) continue;
      if (!busPerEvento.has(eventoId)) busPerEvento.set(eventoId, new Set());
      busPerEvento.get(eventoId)!.add(b.id);
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
  /** Eventi con almeno un tragitto senza ancora nessuna fermata con
   *  orario impostato — stesso criterio già usato da "fermateCompilate"
   *  qui sotto (almeno una fermata con orario = fatto). Conteggio per
   *  la tappa di menu "Orari". */
  async contaEventiDaCalcolareOrari() {
    const righeTragitti = await db
      .select({ eventoId: tragitti.eventoId, tragittoId: tragitti.id })
      .from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(eq(tragitti.attivo, true), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
    if (righeTragitti.length === 0) return 0;

    const tragittiIds = righeTragitti.map((r) => r.tragittoId);
    const fermateConOrario = await db.select({ tragittoId: fermate.tragittoId, orario: fermate.orario })
      .from(fermate).where(inArray(fermate.tragittoId, tragittiIds));
    const conOrario = new Set(fermateConOrario.filter((f) => f.orario).map((f) => f.tragittoId));
    const senzaOrario = righeTragitti.filter((r) => !conOrario.has(r.tragittoId));
    return new Set(senzaOrario.map((r) => r.eventoId)).size;
  },

  // Nome corretto: questi tragitti hanno stato interno "DA_CONFERMARE"
  // (prima ancora di essere prezzati) - da non confondere con la tappa
  // di menu "Da Confermare" (quella per costruire le Linee, tragitti
  // GIA' prezzati) - stessa parola, due concetti diversi. Questo
  // conteggio appartiene alla tappa "Prezzi".
  async contaEventiDaPrezzare() {
    const righe = await db
      .select({ eventoId: tragitti.eventoId })
      .from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(eq(tragitti.stato, 'DA_CONFERMARE'), eq(tragitti.attivo, true), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
    return new Set(righe.map((r) => r.eventoId)).size;
  },

  /** Eventi con almeno un tragitto già prezzato ma senza ancora
   *  nessuna Linea costruita — questo, e non lo stato interno
   *  "DA_CONFERMARE" (un nome simile ma un concetto diverso), è il
   *  conteggio giusto per la tappa di menu "Da Confermare". */
  async contaEventiDaCostruireLinee() {
    const righeTragitti = await db
      .select({ eventoId: tragitti.eventoId, tragittoId: tragitti.id })
      .from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(eq(tragitti.stato, 'PREZZATO'), eq(tragitti.attivo, true), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
    if (righeTragitti.length === 0) return 0;

    const tragittiIds = righeTragitti.map((r) => r.tragittoId);
    const lineeEsistenti = await db.select({ tragittoId: linee.tragittoId }).from(linee).where(inArray(linee.tragittoId, tragittiIds));
    const conLinea = new Set(lineeEsistenti.map((l) => l.tragittoId));
    const senzaLinea = righeTragitti.filter((r) => !conLinea.has(r.tragittoId));
    return new Set(senzaLinea.map((r) => r.eventoId)).size;
  },

  async contaAllertePartenze() {
    const righeTragitti = await db.select({ tragittoId: tragitti.id, postiTotali: tragitti.postiTotali }).from(tragitti);
    if (righeTragitti.length === 0) return 0;

    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.tragittoId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.tragittoId, Number(s.totale)]));

    let conteggio = 0;
    for (const r of righeTragitti) {
      const passeggeri = mappaPasseggeri.get(r.tragittoId) ?? 0;
      if (passeggeri === 0) continue; // niente da coprire, non è un allarme
      if (r.postiTotali < passeggeri) conteggio++;
    }
    return conteggio;
  },

  /** Come sopra, ma per singolo evento — quante tratte con posti
   *  superati ha OGNI evento (non solo il totale generale), usata per
   *  mostrare il pallino di avviso sulla card dell'evento specifico
   *  nella sezione Partenze, non solo nel menu laterale. */
  async allertePartenzePerEvento(): Promise<Record<string, number>> {
    const righeTragitti = await db.select({ tragittoId: tragitti.id, eventoId: tragitti.eventoId, postiTotali: tragitti.postiTotali }).from(tragitti);
    if (righeTragitti.length === 0) return {};
    const mappaEventoDiTragitto = new Map(righeTragitti.map((r) => [r.tragittoId, r.eventoId]));
    const mappaPostiTotali = new Map(righeTragitti.map((r) => [r.tragittoId, r.postiTotali]));

    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.tragittoId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.tragittoId, Number(s.totale)]));

    const risultato: Record<string, number> = {};
    for (const r of righeTragitti) {
      const passeggeri = mappaPasseggeri.get(r.tragittoId) ?? 0;
      if (passeggeri === 0) continue;
      const postiTotali = mappaPostiTotali.get(r.tragittoId) ?? 0;
      if (postiTotali < passeggeri) {
        const eventoId = mappaEventoDiTragitto.get(r.tragittoId)!;
        risultato[eventoId] = (risultato[eventoId] ?? 0) + 1;
      }
    }
    return risultato;
  },

  /** Una riga per ogni PARTENZA (tragitto), non per evento — usata
   *  dalla sezione Partenze, che ora mostra una card per tragitto,
   *  raggruppate per stato (Prezzato/Da confermare/Confermato/Passate)
   *  invece che una card per evento intero. Include i tragitti dentro
   *  ogni servizio (Andata/Ritorno ecc.), non solo quelli liberi —
   *  ognuno diventa una partenza a sé, col nome del suo servizio se ce
   *  l'ha. */
  async elencoPartenze() {
    const righe = await db.select({
      tragittoId: tragitti.id,
      tragittoNome: tragitti.nome,
      stato: tragitti.stato,
      attivo: tragitti.attivo,
      postiTotali: tragitti.postiTotali,
      preventivoCosto: tragitti.preventivoCosto,
      eventoId: eventi.id,
      eventoArtista: eventi.artista,
      eventoGenere: eventi.genere,
      eventoData: eventi.data,
      eventoCitta: eventi.citta,
      eventoLuogo: eventi.luogo,
      eventoSlug: eventi.slug,
      servizioNome: servizi.nome,
      servizioId: tragitti.servizioId,
    }).from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .leftJoin(servizi, eq(servizi.id, tragitti.servizioId))
      .where(and(eq(tragitti.attivo, true), isNull(eventi.eliminatoIl)));

    if (righe.length === 0) return [];

    const tragittiIds = righe.map((r) => r.tragittoId);
    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA')))
      .groupBy(prenotazioni.tragittoId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.tragittoId, Number(s.totale)]));

    // Un'unica immagine per evento (la prima, come già fa la card
    // dell'evento altrove) — una query sola per tutti gli eventi
    // coinvolti, non una per riga.
    const eventoIds = [...new Set(righe.map((r) => r.eventoId))];
    const immaginiRighe = await db.select({ eventoId: immaginiEvento.eventoId, url: immaginiEvento.url, ordine: immaginiEvento.ordine })
      .from(immaginiEvento).where(inArray(immaginiEvento.eventoId, eventoIds)).orderBy(immaginiEvento.ordine);
    const mappaImmagine = new Map<string, string>();
    for (const img of immaginiRighe) if (!mappaImmagine.has(img.eventoId)) mappaImmagine.set(img.eventoId, img.url);

    // Almeno una fermata con orario impostato — serve per distinguere
    // "Fermate" (tragitti ancora senza nessun orario, da configurare)
    // da "Da prezzare" (tragitti dove le fermate sono già pronte, resta
    // solo da inserire il preventivo che torna dal fornitore).
    const fermateRighe = await db.select({ tragittoId: fermate.tragittoId, orario: fermate.orario })
      .from(fermate).where(inArray(fermate.tragittoId, tragittiIds));
    const mappaFermateCompilate = new Map<string, boolean>();
    for (const f of fermateRighe) {
      if (f.orario) mappaFermateCompilate.set(f.tragittoId, true);
    }

    return righe.map((r) => ({
      tragittoId: r.tragittoId,
      tragittoNome: r.tragittoNome,
      stato: r.stato,
      postiTotali: r.postiTotali,
      totalePasseggeri: mappaPasseggeri.get(r.tragittoId) ?? 0,
      preventivoCosto: r.preventivoCosto,
      fermateCompilate: mappaFermateCompilate.get(r.tragittoId) ?? false,
      servizioNome: r.servizioNome,
      servizioId: r.servizioId,
      evento: {
        id: r.eventoId,
        artista: r.eventoArtista,
        genere: r.eventoGenere,
        data: r.eventoData,
        citta: r.eventoCitta,
        luogo: r.eventoLuogo,
        slug: r.eventoSlug,
        immagineUrl: mappaImmagine.get(r.eventoId) ?? null,
      },
    }));
  },
};
