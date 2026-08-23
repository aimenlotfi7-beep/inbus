import { and, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  eventi,
  lineeBus,
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

// Include standard riusato da list/getById: evento con tutte le sue
// relazioni annidate, così il frontend riceve un unico oggetto completo
// (esattamente come faceva il vecchio inbusLoadDB() nel prototipo).
export const includeCompleto = {
  linee: { with: { fermate: true } },
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

export const eventiService = {
  async list(query: ListaEventiQuery) {
    const condizioni = [];
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
      where: condizioni.length ? and(...condizioni) : undefined,
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
    if (!evento.visibileSito || evento.bozza || new Date(evento.data) < new Date()) throw new NonTrovato('Evento');
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
      for (const linea of input.linee) {
        const [nuovaLinea] = await tx
          .insert(lineeBus)
          .values({
            eventoId: nuovoEvento.id,
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

      // Le linee/fermate, se inviate: quelle con un `id` (già esistenti)
      // vengono AGGIORNATE sul posto, non cancellate e ricreate — se le
      // cancellassimo e quella tratta avesse già prenotazioni vere
      // collegate, il database rifiuterebbe la cancellazione (per non
      // perdere quei dati) e l'intero salvataggio fallirebbe con un
      // errore. Solo le linee rimosse dal form vengono davvero cancellate,
      // e solo se non hanno prenotazioni collegate.
      if (input.linee) {
        const lineeEsistenti = await tx.select().from(lineeBus).where(eq(lineeBus.eventoId, id));
        const idsInviati = new Set(input.linee.filter((l) => l.id).map((l) => l.id));

        // Tratte tolte dal form: cancellale solo se libere da prenotazioni.
        for (const esistente of lineeEsistenti) {
          if (idsInviati.has(esistente.id)) continue;
          const collegate = await tx.select({ id: prenotazioni.id }).from(prenotazioni).where(eq(prenotazioni.lineaId, esistente.id)).limit(1);
          if (collegate.length > 0) {
            throw new ConflittoDati(`Non puoi rimuovere la tratta "${esistente.nome}": ha prenotazioni collegate. Lasciala nell'evento, anche se non la usi più per le nuove vendite.`);
          }
          await tx.delete(lineeBus).where(eq(lineeBus.id, esistente.id)); // cascade su fermate/bus_tratte
        }

        for (const linea of input.linee) {
          const giaEsistente = linea.id ? lineeEsistenti.find((l) => l.id === linea.id) : undefined;

          if (giaEsistente) {
            // I posti occupati (venduti) restano tali: se cambi i posti
            // totali, i disponibili si aggiustano della stessa quantità,
            // invece di essere resettati (perderebbe traccia di chi ha
            // già prenotato).
            const postiOccupati = giaEsistente.postiTotali - giaEsistente.postiDisponibili;
            const nuoviPostiDisponibili = Math.max(0, linea.postiTotali - postiOccupati);

            await tx.update(lineeBus).set({
              nome: linea.nome,
              postiTotali: linea.postiTotali,
              postiDisponibili: nuoviPostiDisponibili,
              prezzoExtra: linea.prezzoExtra.toFixed(2),
              referenteNome: linea.referenteNome,
              referenteTelefono: linea.referenteTelefono,
              fornitoreId: linea.fornitoreId,
            }).where(eq(lineeBus.id, giaEsistente.id));

            // Le fermate non hanno prenotazioni collegate direttamente
            // (le prenotazioni salvano città/indirizzo come testo, non un
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
            // Tratta nuova.
            const [nuovaLinea] = await tx
              .insert(lineeBus)
              .values({
                eventoId: id,
                nome: linea.nome,
                postiTotali: linea.postiTotali,
                postiDisponibili: linea.postiTotali,
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
        }
      }

      return id;
    });
  },

  async remove(id: string) {
    await getById(id);
    const prenotazioniCollegate = await db
      .select({ id: prenotazioni.id })
      .from(prenotazioni)
      .where(eq(prenotazioni.eventoId, id));
    if (prenotazioniCollegate.length > 0) {
      throw new ConflittoDati(
        `Non puoi eliminare questo evento: ci sono ${prenotazioniCollegate.length} prenotazioni collegate (anche cancellate restano nello storico). Cancella prima quelle prenotazioni, se proprio necessario, oppure lascia l'evento così com'è: non comparirà più nelle nuove vendite se ne rimuovi la vetrina/evidenza.`
      );
    }
    await db.delete(eventi).where(eq(eventi.id, id)); // cascade su linee/fermate/immagini/chat/lista attesa/promoter
  },

  /** Somma i posti disponibili su tutte le linee di un evento. */
  postiTotaliDisponibili(evento: Awaited<ReturnType<typeof getById>>) {
    return evento.linee.reduce((somma, l) => somma + l.postiDisponibili, 0);
  },

  /** Una riga per ogni fermata prenotabile, con il prezzo effettivo già
   *  calcolato (sovrascrive prezzo base+extra se la fermata ha un prezzo
   *  proprio) — usata dal checkout sul sito pubblico. */
  async opzioniPartenza(eventoId: string) {
    const evento = await getById(eventoId);
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

    for (const linea of evento.linee) {
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
};
