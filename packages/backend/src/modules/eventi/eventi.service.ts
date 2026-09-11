import { and, eq, ilike, inArray, isNull, sql, gte, lt, asc, ne } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  eventi,
  tragitti,
  servizi,
  fermate,
  fermateAnagrafica,
  immaginiEvento,
  allegatiEvento,
  prenotazioni,
  busFisici,
  linee,
  lineaFermate,
  tourLeader,
  utenti,
  partecipantiPrenotazione,
  preventiviRichieste,
  preventiviRisposte,
} from '../../db/schema.js';
import crypto from 'node:crypto';
import { NonTrovato, ConflittoDati, ErroreApplicativo } from '../../shared/errors.js';
import { busNonTrovato, generaPdfPasseggeriBus, leggiSchedaBus, passeggeriDelBus, type PasseggeroBus } from './passeggeri-bus.service.js';
import { prezzoNormaleFermata } from '../../shared/prezzi.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import type { CreaEventoInput, AggiornaEventoInput, ListaEventiQuery } from './eventi.dto.js';
import { tragittoSchema, aggiornaTragittoOperativoSchema, registraPreventivoManualeSchema, calcolaPrezziVenditaSchema } from './eventi.dto.js';
import {
  rilevaVariazioni, generaComunicazioniVariazione, anteprimaComunicazioni, normalizzaOrario, normalizzaTesto,
  type FermataConfronto, type VariazioneRilevata, type EsitoComunicazioni,
} from '../variazioni/variazioni.service.js';
import { calcolaKmApprossimati } from '../../shared/distanza.js';
import { tourService } from '../tour/tour.service.js';
import { templateEmailService } from '../template-email/template-email.service.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';
import { formattaData, formattaDataOra } from '../../shared/formato.js';
import type { z } from 'zod';

type TragittoInput = z.infer<typeof tragittoSchema>;
type VariazioniDiTragitto = { tragittoId: string; tragittoNome: string; variazioni: VariazioneRilevata[] };

/** Le fermate in arrivo dal form, negli stessi campi che rilevaVariazioni
 *  confronta con quelle salvate (vedi fermateSalvatePerConfronto). */
function fermateInputPerConfronto(lista: { citta: string; indirizzo: string; orario?: string; attivo: boolean }[]): FermataConfronto[] {
  return lista.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario ?? null, attivo: f.attivo }));
}

/** Le fermate oggi salvate, per tragitto — i "vecchi" valori veri, da
 *  leggere PRIMA di qualunque salvataggio. */
async function fermateSalvatePerConfronto(tragittiIds: string[]): Promise<Map<string, FermataConfronto[]>> {
  const mappa = new Map<string, FermataConfronto[]>();
  if (tragittiIds.length === 0) return mappa;
  const righe = await db.select({ tragittoId: fermate.tragittoId, citta: fermate.citta, indirizzo: fermate.indirizzo, orario: fermate.orario, attivo: fermate.attivo })
    .from(fermate).where(inArray(fermate.tragittoId, tragittiIds)).orderBy(asc(fermate.ordine));
  for (const r of righe) {
    const lista = mappa.get(r.tragittoId) ?? [];
    lista.push({ citta: r.citta, indirizzo: r.indirizzo, orario: r.orario, attivo: r.attivo });
    mappa.set(r.tragittoId, lista);
  }
  return mappa;
}

/** Una fermata disattivata ma ancora dentro una linea resta servita dai
 *  bus di quella linea (vedi "Gestisci fermate" in Partenze): chi ha
 *  prenotato lì non va avvisato che "non è più prevista". Restano solo le
 *  fermate tolte davvero, o disattivate senza nessuna linea che le copra. */
async function senzaFermateCoperteDaLinee(
  tragittoId: string,
  nuove: { citta: string; attivo?: boolean | null }[],
  rilevate: VariazioneRilevata[],
): Promise<VariazioneRilevata[]> {
  const disattivate = new Set(nuove.filter((f) => f.attivo === false).map((f) => f.citta));
  if (disattivate.size === 0 || rilevate.length === 0) return rilevate;
  const coperte = await db.selectDistinct({ citta: fermate.citta }).from(lineaFermate)
    .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
    // Solo linee confermate: una linea da confermare non ha ancora un bus.
    .innerJoin(linee, and(eq(linee.id, lineaFermate.lineaId), eq(linee.daConfermare, false)))
    .where(eq(fermate.tragittoId, tragittoId));
  const cittaCoperte = new Set(coperte.map((c) => c.citta));
  return rilevate.filter((v) => !(v.fermataVecchia && disattivate.has(v.fermataVecchia.citta) && cittaCoperte.has(v.fermataVecchia.citta)));
}

/** Cosa cambia per i clienti già prenotati se si salva questo
 *  aggiornamento dell'evento (PUT /eventi/:id): le fermate dei tragitti
 *  esistenti (lo stesso elenco che sincronizzaTuttiITragitti riscrive) e,
 *  per tutte le prenotazioni confermate dell'evento, data/ora e luogo.
 *  Nessuna scrittura: la usano sia il salvataggio vero (PRIMA della
 *  transazione, quando i dati vecchi sono ancora quelli veri) sia
 *  l'anteprima. */
async function rilevaVariazioniEvento(eventoId: string, input: AggiornaEventoInput): Promise<VariazioniDiTragitto[]> {
  const [evento] = await db.select().from(eventi).where(eq(eventi.id, eventoId)).limit(1);
  if (!evento) throw new NonTrovato('Evento');

  const perTragitto = new Map<string, VariazioniDiTragitto>();
  function aggiungi(tragittoId: string, tragittoNome: string, rilevate: VariazioneRilevata[]) {
    if (rilevate.length === 0) return;
    const voce = perTragitto.get(tragittoId) ?? { tragittoId, tragittoNome, variazioni: [] };
    voce.variazioni.push(...rilevate);
    perTragitto.set(tragittoId, voce);
  }

  // Stessi bersagli e stesso ordine di update(): i liberi (senza
  // servizioId) poi quelli di ogni servizio — se un id compare due
  // volte vince l'ultimo, come nella sincronizzazione.
  const tragittiInPayload = new Map<string, TragittoInput>();
  if (input.tragitti || input.servizi) {
    for (const t of (input.tragitti ?? []).filter((l) => !l.servizioId)) if (t.id) tragittiInPayload.set(t.id, t);
    for (const s of input.servizi ?? []) for (const t of s.tragitti) if (t.id) tragittiInPayload.set(t.id, t);
  }
  if (tragittiInPayload.size > 0) {
    const esistenti = await db.select({ id: tragitti.id }).from(tragitti)
      .where(and(eq(tragitti.eventoId, eventoId), isNull(tragitti.eliminatoIl), inArray(tragitti.id, [...tragittiInPayload.keys()])));
    const vecchiePerTragitto = await fermateSalvatePerConfronto(esistenti.map((t) => t.id));
    for (const { id } of esistenti) {
      const nuovo = tragittiInPayload.get(id)!;
      aggiungi(id, nuovo.nome, await senzaFermateCoperteDaLinee(id, nuovo.fermate, await rilevaVariazioni(vecchiePerTragitto.get(id) ?? [], fermateInputPerConfronto(nuovo.fermate))));
    }
  }

  // Cambi dell'evento stesso: toccano tutte le prenotazioni confermate.
  const cambiEvento: string[] = [];
  if (input.data !== undefined) {
    const prima = new Date(evento.data);
    const dopo = new Date(input.data);
    // Stesso istante (o differenza invisibile al minuto) = nessun cambio.
    if (prima.getTime() !== dopo.getTime() && formattaDataOra(prima) !== formattaDataOra(dopo)) {
      cambiEvento.push(`La data del viaggio è cambiata: da ${formattaDataOra(prima)} a ${formattaDataOra(dopo)}.`);
    }
  }
  const luogoPrima = normalizzaTesto(evento.luogo);
  const cittaPrima = normalizzaTesto(evento.citta);
  const luogoDopo = normalizzaTesto(input.luogo ?? evento.luogo);
  const cittaDopo = normalizzaTesto(input.citta ?? evento.citta);
  if (luogoDopo !== luogoPrima || cittaDopo !== cittaPrima) {
    cambiEvento.push(`Il luogo dell'evento è cambiato: ora è ${luogoDopo}, ${cittaDopo} (prima era ${luogoPrima}, ${cittaPrima}).`);
  }
  if (cambiEvento.length > 0) {
    const coinvolti = await db.selectDistinct({ tragittoId: tragitti.id, nome: tragitti.nome })
      .from(prenotazioni)
      .innerJoin(tragitti, eq(tragitti.id, prenotazioni.tragittoId))
      .where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));
    for (const t of coinvolti) {
      aggiungi(t.tragittoId, tragittiInPayload.get(t.tragittoId)?.nome ?? t.nome, cambiEvento.map((descrizione) => ({ fermataVecchia: null, descrizione })));
    }
  }

  return [...perTragitto.values()];
}

/** Invia le comunicazioni di più tragitti e somma i conteggi. Non lancia
 *  mai (vedi generaComunicazioniVariazione). */
async function comunicaVariazioni(lista: VariazioniDiTragitto[]): Promise<EsitoComunicazioni> {
  const esito: EsitoComunicazioni = { clientiAvvisati: 0, emailNonInviate: 0 };
  for (const t of lista) {
    const r = await generaComunicazioniVariazione(t.tragittoId, t.variazioni);
    esito.clientiAvvisati += r.clientiAvvisati;
    esito.emailNonInviate += r.emailNonInviate;
  }
  return esito;
}

/** Il tragitto è appena diventato CONFERMATO (prima Linea creata):
 *  avviso a ogni prenotazione confermata. Dopo il commit, best effort —
 *  non lancia mai, un cliente non raggiunto non ferma gli altri. */
async function avvisaPartenzaConfermata(tragittoId: string): Promise<EsitoComunicazioni> {
  const esito: EsitoComunicazioni = { clientiAvvisati: 0, emailNonInviate: 0 };
  try {
    const [riga] = await db.select({ tragittoNome: tragitti.nome, artista: eventi.artista, data: eventi.data })
      .from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(eq(tragitti.id, tragittoId)).limit(1);
    if (!riga) return esito;
    // L'orario ATTUALE della fermata prenotata (può essere cambiato dopo
    // la prenotazione); quello salvato sulla prenotazione solo di riserva.
    const orariFermate = await db.select({ citta: fermate.citta, orario: fermate.orario }).from(fermate).where(eq(fermate.tragittoId, tragittoId));
    const orarioPerCitta = new Map(orariFermate.map((f) => [f.citta, f.orario]));
    const destinatari = await db.select({
      pnr: prenotazioni.pnr, fermataCitta: prenotazioni.fermataCitta, fermataOrario: prenotazioni.fermataOrario,
      email: utenti.email, nome: utenti.nome,
    }).from(prenotazioni)
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')));

    for (const d of destinatari) {
      esito.clientiAvvisati++;
      try {
        const { oggetto, html } = await templateEmailService.renderizza('partenza_confermata', {
          nome: d.nome ?? '',
          evento: riga.artista,
          data: formattaData(riga.data),
          tragitto: riga.tragittoNome,
          fermata: d.fermataCitta,
          orario: normalizzaOrario(orarioPerCitta.get(d.fermataCitta) ?? d.fermataOrario) ?? 'da definire',
          pnr: d.pnr,
        }, { escapaHtml: ['nome', 'evento', 'tragitto', 'fermata', 'orario', 'pnr'] });
        const { inviata } = await inviaEmail({ a: d.email, oggetto, html });
        if (!inviata) esito.emailNonInviate++;
      } catch (err) {
        esito.emailNonInviate++;
        console.error(`[partenze] avviso "partenza confermata" a ${d.email} (PNR ${d.pnr}) non riuscito:`, err);
      }
    }
  } catch (err) {
    console.error(`[partenze] avvisi "partenza confermata" per il tragitto ${tragittoId} non riusciti:`, err);
  }
  return esito;
}

/** Avvisa il tour leader appena assegnato a un bus. Dopo il commit, best
 *  effort: torna false se l'email non parte, non lancia mai. */
async function avvisaTourLeader(busId: string): Promise<boolean> {
  try {
    const [riga] = await db.select({
      riferimento: busFisici.riferimento, lineaNome: linee.nome, tragittoNome: tragitti.nome,
      artista: eventi.artista, data: eventi.data, nome: tourLeader.nome, email: tourLeader.email,
    }).from(busFisici)
      .innerJoin(tourLeader, eq(tourLeader.id, busFisici.tourLeaderId))
      .innerJoin(linee, eq(linee.id, busFisici.lineaId))
      .innerJoin(tragitti, eq(tragitti.id, linee.tragittoId))
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(eq(busFisici.id, busId)).limit(1);
    if (!riga?.email) return false;
    const { oggetto, html } = await templateEmailService.renderizza('tour_leader_assegnato', {
      nome: riga.nome,
      evento: riga.artista,
      data: formattaData(riga.data),
      tragitto: riga.tragittoNome,
      bus: `${riga.lineaNome} · ${riga.riferimento}`,
      link: urlSito('/scansione/accedi'),
    }, { escapaHtml: ['nome', 'evento', 'tragitto', 'bus'] });
    const { inviata } = await inviaEmail({ a: riga.email, oggetto, html });
    return inviata;
  } catch (err) {
    console.error(`[partenze] avviso al tour leader del bus ${busId} non riuscito:`, err);
    return false;
  }
}

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
  // fermate ordinate per "ordine" (il campo logico, non l'ordine del
  // database) — senza, "la prima fermata" nell'array potrebbe NON
  // essere davvero la partenza, se le fermate sono state riordinate
  // dopo la creazione. Bug corretto qui: mancava su entrambe le
  // relazioni (tragitti liberi e dentro i servizi).
  tragitti: { where: and(isNull(tragitti.eliminatoIl), isNull(tragitti.servizioId)), with: { fermate: { orderBy: () => [asc(fermate.ordine)] } } },
  // I servizi (se l'evento ne ha) — ognuno con le proprie tratte. Un
  // evento senza nessun servizio (il caso normale) ha semplicemente un
  // array vuoto qui: tutto continua a funzionare come prima.
  servizi: { with: { tragitti: { where: isNull(tragitti.eliminatoIl), with: { fermate: { orderBy: () => [asc(fermate.ordine)] } } } } },
  immagini: true,
  allegati: true,
} as const;

/** Rimette i posti in vendita di un tragitto a "quasi illimitati" ogni
 *  volta che l'elenco dei bus cambia (bus nuovo, posti cambiati, bus o
 *  linea tolti): le vendite non si fermano per i posti dei bus. I posti
 *  già occupati (venduti) restano tali. Blocca solo la rimozione
 *  dell'ultimo bus di un tragitto con posti venduti. */
// Usato quando un tragitto diventa prenotabile (preventivo registrato)
// ma non ha ancora nessun bus vero — le vendite non devono avere un
// tetto in quella fase (vedi registraPreventivo). Un numero enorme
// invece di un vero infinito: resta un intero valido nel database, e
// il sito non mostra comunque mai il numero esatto al cliente.
const POSTI_QUASI_ILLIMITATI = 999999;

/** Chi chiede il ricalcolo dei posti: serve solo a un messaggio di rifiuto
 *  che parli dell'azione appena tentata. */
type AzioneSuiBus = 'rimuovi_bus' | 'elimina_linea';

function testoPostiVenduti(n: number) {
  return n === 1 ? "c'è già 1 posto venduto" : `ci sono già ${n} posti venduti`;
}

async function ricalcolaPostiTragitto(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tragittoId: string, azione?: AzioneSuiBus) {
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
  if (idBusUnici.size === 0 && postiOccupati > 0) {
    // Togliere l'ultimo bus di un tragitto con posti venduti lascerebbe
    // clienti paganti senza nessun bus, senza nemmeno un avviso.
    if (azione === 'rimuovi_bus') throw new ConflittoDati(`Non puoi rimuovere questo bus: sul tragitto ${testoPostiVenduti(postiOccupati)} e senza di lui non resterebbe nessun bus. Aggiungi prima un altro bus, poi riprova.`);
    if (azione === 'elimina_linea') throw new ConflittoDati(`Non puoi eliminare questa linea: sul tragitto ${testoPostiVenduti(postiOccupati)} e senza i suoi bus non resterebbe nessun bus. Aggiungi prima un bus su un'altra linea, poi riprova.`);
  }
  // Le vendite non si fermano mai per i posti dei bus (deciso dal
  // proprietario: quando i bus si riempiono nasce una linea da confermare,
  // vedi linee-da-confermare.service.ts). I posti in vendita restano "quasi
  // illimitati"; i posti veri dei bus contano per le linee da confermare e
  // per lo smistamento. Un evento si ferma solo con "Ferma vendite".
  await tx.update(tragitti).set({
    postiTotali: POSTI_QUASI_ILLIMITATI,
    postiDisponibili: Math.max(0, POSTI_QUASI_ILLIMITATI - postiOccupati),
  }).where(eq(tragitti.id, tragittoId));
}

/** Per ogni tragitto: i posti dei bus veri e quante linee da confermare ha.
 *  Servono al posto di postiTotali, che resta "quasi illimitato". */
async function postiBusELineeDaConfermare(tragittiIds: string[]) {
  const postiSuiBus = new Map<string, number>();
  const lineeDaConfermare = new Map<string, number>();
  if (tragittiIds.length === 0) return { postiSuiBus, lineeDaConfermare };
  const righeLinee = await db.select({ id: linee.id, tragittoId: linee.tragittoId, daConfermare: linee.daConfermare })
    .from(linee).where(inArray(linee.tragittoId, tragittiIds));
  const righeBus = righeLinee.length
    ? await db.select({ lineaId: busFisici.lineaId, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.lineaId, righeLinee.map((l) => l.id)))
    : [];
  const tragittoDiLinea = new Map(righeLinee.map((l) => [l.id, l.tragittoId]));
  for (const b of righeBus) {
    const tragittoId = b.lineaId ? tragittoDiLinea.get(b.lineaId) : undefined;
    if (tragittoId) postiSuiBus.set(tragittoId, (postiSuiBus.get(tragittoId) ?? 0) + (b.postiBus ?? 0));
  }
  for (const l of righeLinee) if (l.daConfermare) lineeDaConfermare.set(l.tragittoId, (lineeDaConfermare.get(l.tragittoId) ?? 0) + 1);
  return { postiSuiBus, lineeDaConfermare };
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
      // MA le Linee sì (linea_fermate → fermate.id, con cancellazione
      // a cascata) — cancellare e ricreare le fermate ad ogni
      // salvataggio, anche per una modifica banale al tragitto (es.
      // solo il nome), altrimenti spezzerebbe in silenzio la copertura
      // di una Linea già costruita. Salvo prima chi copriva cosa (per
      // città, l'identificatore più stabile fra vecchia e nuova riga —
      // l'id cambia sempre, la città no), poi ricollego alle nuove
      // fermate dopo averle inserite.
      const collegamentiLineaDaPreservare = await tx
        .select({ citta: fermate.citta, lineaId: lineaFermate.lineaId, ordine: lineaFermate.ordine })
        .from(lineaFermate)
        .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
        .where(eq(fermate.tragittoId, giaEsistente.id));

      await tx.delete(fermate).where(eq(fermate.tragittoId, giaEsistente.id));
      if (tragitto.fermate.length) {
        const nuoveFermate = await tx.insert(fermate).values(
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
        ).returning({ id: fermate.id, citta: fermate.citta });

        if (collegamentiLineaDaPreservare.length) {
          const daRicollegare = nuoveFermate.flatMap((nf) =>
            collegamentiLineaDaPreservare
              .filter((c) => c.citta === nf.citta)
              .map((c) => ({ lineaId: c.lineaId, fermataId: nf.id, ordine: c.ordine }))
          );
          if (daRicollegare.length) await tx.insert(lineaFermate).values(daRicollegare);
        }
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
      condizioni.push(eq(eventi.venditeFermate, false)); // "Ferma vendite": l'evento sparisce dal sito
      // Un evento senza nemmeno un tragitto confermato (nessun bus vero
      // registrato) non compare affatto — come se non esistesse ancora,
      // non solo "senza niente da prenotare". Basta UN tragitto
      // confermato in un servizio qualsiasi (o libero) perché l'evento
      // torni visibile. Due passaggi invece di una sotto-query SQL
      // scritta a mano dentro il where — più facile da verificare che
      // faccia davvero quello che deve.
      const righeConfermate = await db.selectDistinct({ eventoId: tragitti.eventoId }).from(tragitti)
        // isNull(eliminatoIl): un evento il cui unico tragitto prezzato è
        // stato rimosso non deve restare in vendita sul sito.
        .where(and(inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl)));
      const idEventiConfermati = righeConfermate.map((r) => r.eventoId);
      if (idEventiConfermati.length === 0) return []; // nessun evento ha nemmeno un tragitto confermato: lista vuota, senza nemmeno interrogare il resto
      condizioni.push(inArray(eventi.id, idEventiConfermati));
    }

    // Solo se richiesto esplicitamente (la home) — tolti gli eventi che
    // appartengono a un Tour, e al loro posto (in fondo, poi si
    // riordina tutto per data) una card sola per ciascun Tour.
    let cardTour: Awaited<ReturnType<typeof tourService.cardVirtualiTour>> = [];
    if (query.escludiEventiInTour) {
      const idInTour = await tourService.eventiInTour();
      if (idInTour.size > 0) condizioni.push(sql`${eventi.id} NOT IN (${sql.join([...idInTour].map((id) => sql`${id}`), sql`, `)})`);
      cardTour = await tourService.cardVirtualiTour(!!query.soloFuturi, !!query.soloVisibili);
    }

    const risultati = await db.query.eventi.findMany({
      where: and(...condizioni),
      with: includeCompleto,
      orderBy: (e, { asc }) => [asc(e.data)],
    });
    const conStato = risultati.map(conStatoCalcolato);
    if (cardTour.length === 0) return conStato;
    return [...conStato, ...cardTour].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  },

  getById,

  /** Quante persone hanno già confermato per questo evento (somma dei
   *  passeggeri sulle prenotazioni CONFERMATE, su tutti i suoi
   *  tragitti/fermate insieme) — per la prova sociale sulla pagina
   *  pubblica ("127 persone hanno già prenotato"). Un numero solo,
   *  una query leggera, pubblica (nessun dato personale, solo un
   *  conteggio). */
  async conteggioPrenotazioniConfermate(eventoId: string): Promise<number> {
    const [riga] = await db.select({ totale: sql<number>`coalesce(sum(${prenotazioni.passeggeri}), 0)::int` })
      .from(prenotazioni).where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));
    return riga?.totale ?? 0;
  },

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
          cosaIncluso: input.cosaIncluso,
          requisitiNote: input.requisitiNote,
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

  /** Le variazioni che toccano clienti già prenotati (fermate dei
   *  tragitti esistenti, data/ora, luogo) si rilevano PRIMA della
   *  transazione, quando i dati vecchi sono ancora quelli veri, e si
   *  comunicano DOPO il commit, best effort (vedi comunicaVariazioni). */
  async update(id: string, input: AggiornaEventoInput): Promise<{ id: string } & EsitoComunicazioni> {
    await getById(id); // lancia NonTrovato se non esiste
    const nuovoSlug = input.slug?.trim() ? await generaSlugUnivoco(input.slug.trim(), id) : undefined;
    const variazioniDaComunicare = await rilevaVariazioniEvento(id, input);

    await db.transaction(async (tx) => {
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
          ...(input.cosaIncluso !== undefined && { cosaIncluso: input.cosaIncluso }),
          ...(input.requisitiNote !== undefined && { requisitiNote: input.requisitiNote }),
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
    });

    // Solo a salvataggio confermato — non lancia mai.
    const esito = await comunicaVariazioni(variazioniDaComunicare);
    return { id, ...esito };
  },

  /** Anteprima di update() con lo stesso corpo: quali variazioni e
   *  quante email partirebbero. Nessuna scrittura. fermata = '' per i
   *  cambi di tutto il viaggio (data/ora, luogo). */
  async anteprimaVariazioniEvento(id: string, input: AggiornaEventoInput) {
    const perTragitto = await rilevaVariazioniEvento(id, input);
    const variazioni: { tragitto: string; fermata: string; descrizione: string; clienti: number }[] = [];
    for (const t of perTragitto) {
      for (const r of await anteprimaComunicazioni(t.tragittoId, t.variazioni)) {
        variazioni.push({ tragitto: t.tragittoNome, fermata: r.fermata, descrizione: r.descrizione, clienti: r.clienti });
      }
    }
    return { clientiTotali: variazioni.reduce((s, v) => s + v.clienti, 0), variazioni };
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
      // Regione della fermata (se scelta dall'anagrafica) — per
      // raggruppare il menu a tendina sul sito, come le fermate
      // e i fornitori nel gestionale.
      fermataRegione: string | null;
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

    // Una sola query per la regione di TUTTE le fermate collegate
    // all'anagrafica, di tutti i tragitti mostrati — non una per fermata.
    const idAnagraficaUsati = [...new Set(tragittiDaMostrare.flatMap((t) => t.fermate.map((f) => f.fermataAnagraficaId).filter((id): id is string => !!id)))];
    const regionePerAnagrafica = new Map<string, string | null>();
    if (idAnagraficaUsati.length > 0) {
      const righe = await db.select({ id: fermateAnagrafica.id, regione: fermateAnagrafica.regione }).from(fermateAnagrafica).where(inArray(fermateAnagrafica.id, idAnagraficaUsati));
      for (const r of righe) regionePerAnagrafica.set(r.id, r.regione);
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
          fermataRegione: f.fermataAnagraficaId ? regionePerAnagrafica.get(f.fermataAnagraficaId) ?? null : null,
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

    // Posti dei bus veri e linee da confermare: postiTotali resta "quasi
    // illimitato" (le vendite non si fermano per i bus) e non dice più
    // quanti posti ci sono davvero.
    const { postiSuiBus, lineeDaConfermare } = await postiBusELineeDaConfermare(tuttiITragitti.map((t) => t.id));

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

      // Coperta = i bus veri delle linee confermate bastano per tutti i
      // passeggeri confermati. postiTotali del tragitto non serve più: resta
      // "quasi illimitato" perché le vendite non si fermano per i bus.
      const postiBus = postiSuiBus.get(tragitto.id) ?? 0;
      const coperta = totalePasseggeri > 0 && postiBus >= totalePasseggeri;

      return {
        tragittoId: tragitto.id,
        servizioId: tragitto.servizioId,
        nome: tragitto.nome,
        stato: tragitto.stato,
        // Posti dei bus confermati, non quelli in vendita.
        postiTotali: postiBus,
        capienzaPerBus: capienza,
        fermate: fermateConPasseggeri,
        totalePasseggeri,
        busSuggeriti,
        coperta,
        postiBusCensiti: postiBus,
        lineeDaConfermare: lineeDaConfermare.get(tragitto.id) ?? 0,
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
  async aggiornaTragittoOperativo(tragittoId: string, input: z.infer<typeof aggiornaTragittoOperativoSchema>): Promise<EsitoComunicazioni> {
    const [esiste] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!esiste) throw new NonTrovato('Tragitto');

    // Rilevo le variazioni PRIMA di toccare il database — servono le
    // fermate vecchie vere per il confronto (vedi rilevaVariazioni).
    const vecchie = await fermateSalvatePerConfronto([tragittoId]);
    const variazioniRilevate = await senzaFermateCoperteDaLinee(tragittoId, input.fermate, await rilevaVariazioni(vecchie.get(tragittoId) ?? [], fermateInputPerConfronto(input.fermate)));

    await db.transaction(async (tx) => {
      // I posti non si toccano più qui — restano quelli calcolati dai
      // bus registrati (vedi ricalcolaPostiTragitto, chiamata dai
      // punti che toccano davvero i bus: creaBus/aggiornaBus/rimuoviBus).
      // prezzoExtra solo se arriva: se manca resta quello già salvato.
      if (input.prezzoExtra !== undefined) {
        await tx.update(tragitti).set({
          prezzoExtra: input.prezzoExtra.toFixed(2),
        }).where(eq(tragitti.id, tragittoId));
      }

      // Stessa preservazione già fatta in salvaTragitti qui sopra —
      // le Linee (linea_fermate → fermate.id, cancellazione a
      // cascata) qui sono ancora più a rischio: questa funzione si usa
      // da Partenze, DOPO che le Linee sono già state costruite in
      // molti casi. Salvo chi copriva cosa (per città) prima di
      // cancellare, ricollego alle nuove fermate dopo.
      const collegamentiLineaDaPreservare = await tx
        .select({ citta: fermate.citta, lineaId: lineaFermate.lineaId, ordine: lineaFermate.ordine })
        .from(lineaFermate)
        .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
        .where(eq(fermate.tragittoId, tragittoId));

      await tx.delete(fermate).where(eq(fermate.tragittoId, tragittoId));
      if (input.fermate.length) {
        const nuoveFermate = await tx.insert(fermate).values(
          input.fermate.map((f, ordine) => ({
            tragittoId, ordine,
            fermataAnagraficaId: f.fermataAnagraficaId,
            citta: f.citta, indirizzo: f.indirizzo,
            orario: f.orario, orarioRitorno: f.orarioRitorno, indirizzoRitorno: f.indirizzoRitorno,
            postiMax: f.postiMax, prezzo: f.prezzo?.toFixed(2),
            sogliaMinima: f.sogliaMinima, attivo: f.attivo,
          }))
        ).returning({ id: fermate.id, citta: fermate.citta });

        if (collegamentiLineaDaPreservare.length) {
          const daRicollegare = nuoveFermate.flatMap((nf) =>
            collegamentiLineaDaPreservare
              .filter((c) => c.citta === nf.citta)
              .map((c) => ({ lineaId: c.lineaId, fermataId: nf.id, ordine: c.ordine }))
          );
          if (daRicollegare.length) await tx.insert(lineaFermate).values(daRicollegare);
        }
      }
    });

    // Le comunicazioni partono SOLO dopo che il salvataggio è andato a
    // buon fine — non devono partire per un salvataggio poi fallito.
    // Non lancia mai: un problema qui si registra, non diventa un 500.
    return generaComunicazioniVariazione(tragittoId, variazioniRilevate);
  },

  /** Anteprima di aggiornaTragittoOperativo con lo stesso corpo: quali
   *  variazioni e quante email partirebbero. Nessuna scrittura. */
  async anteprimaTragittoOperativo(tragittoId: string, input: z.infer<typeof aggiornaTragittoOperativoSchema>) {
    const [esiste] = await db.select({ id: tragitti.id }).from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!esiste) throw new NonTrovato('Tragitto');
    const vecchie = await fermateSalvatePerConfronto([tragittoId]);
    const rilevate = await senzaFermateCoperteDaLinee(tragittoId, input.fermate, await rilevaVariazioni(vecchie.get(tragittoId) ?? [], fermateInputPerConfronto(input.fermate)));
    const variazioni = await anteprimaComunicazioni(tragittoId, rilevate);
    return { clientiTotali: variazioni.reduce((s, v) => s + v.clienti, 0), variazioni };
  },

  /** Registra il preventivo (stima dal fornitore, sullo scenario più
   *  caro) e salva i prezzi già calcolati per ogni fermata — sblocca la
   *  vendita (stato "Prezzato") senza bisogno di un bus vero opzionato,
   *  che arriva solo dopo, quando le prenotazioni chiariscono da dove
   *  costruire la prima Linea vera. */
  // Sezione PREVENTIVI: registra il costo del bus (fornitore+file
  // facoltativi) — non tocca i prezzi di vendita, non rende ancora
  // vendibile il tragitto (serve il passo Prezzi dopo, che li calcola
  // da questo costo).
  async registraPreventivoManuale(tragittoId: string, input: z.infer<typeof registraPreventivoManualeSchema>) {
    const [esiste] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!esiste) throw new NonTrovato('Tragitto');

    await db.transaction(async (tx) => {
      const kmAccettati = input.fornitoreId ? await calcolaKmApprossimati(tragittoId) : null;
      await tx.update(tragitti).set({
        preventivoCosto: input.preventivoCosto.toFixed(2),
        preventivoPostiBus: input.preventivoPostiBus,
        // Facoltativo — ma se non indicato qui, non si perde quello già
        // presente (es. un preventivo accettato in precedenza tramite
        // la tab Preventivi, poi ritoccato qui solo nel costo).
        ...(input.fornitoreId && { fornitoreId: input.fornitoreId }),
        ...(kmAccettati != null && { kmAccettati }),
      }).where(eq(tragitti.id, tragittoId));

      // Un inserimento manuale con fornitore indicato genera comunque
      // una riga richiesta+risposta — così compare insieme alle altre
      // nella tab Preventivi, non in un posto a parte, anche se qui
      // nessuna mail è stata davvero inviata (il fornitore l'aveva già
      // dato fuori dal sistema, es. telefono/mail diretta).
      if (input.fornitoreId) {
        const [richiesta] = await tx.insert(preventiviRichieste).values({
          tragittoId, fornitoreId: input.fornitoreId, token: crypto.randomBytes(24).toString('hex'), tipoInvio: 'MANUALE',
        }).returning();
        await tx.insert(preventiviRisposte).values({
          richiestaId: richiesta.id, prezzo: input.preventivoCosto.toFixed(2), fileNome: input.fileNome, fileContenuto: input.fileContenuto,
        });
      }
    });
  },

  // Sezione PREZZI: i prezzi di vendita per fermata, da un costo GIÀ
  // noto (impostato in Preventivi) — non tocca fornitore/costo.
  async calcolaPrezziVendita(tragittoId: string, input: z.infer<typeof calcolaPrezziVenditaSchema>) {
    const [esiste] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!esiste) throw new NonTrovato('Tragitto');
    if (!esiste.preventivoCosto) throw new ConflittoDati('Registra prima un preventivo (sezione Preventivi) prima di calcolare i prezzi di vendita.');

    await db.transaction(async (tx) => {
      for (const { fermataId, prezzo } of input.prezziPerFermata) {
        await tx.update(fermate).set({ prezzo: prezzo.toFixed(2) })
          .where(and(eq(fermate.id, fermataId), eq(fermate.tragittoId, tragittoId))); // il secondo controllo è una sicurezza in più, non fidarsi di un id passato dal client senza verificarlo
      }
      // Solo un passaggio in avanti — non tocca un tragitto già
      // "Confermato" (avrebbe un bus vero, non ha senso retrocederlo).
      if (esiste.stato === 'DA_CONFERMARE') {
        await tx.update(tragitti).set({ stato: 'PREZZATO' }).where(eq(tragitti.id, tragittoId));
      }

      // Da qui il tragitto è prenotabile sul sito, senza tetto: le vendite
      // non si fermano mai per i posti dei bus (deciso dal proprietario,
      // vedi ricalcolaPostiTragitto), né per i "posti presunti" del
      // preventivo, che contano solo per le linee da confermare. "Quasi
      // illimitato" invece di un vero infinito: il sito non mostra mai il
      // numero esatto (solo "Posti disponibili"/"Pochi posti"/"Esaurito" a
      // soglie — vedi PercorsoBus.tsx) e resta un intero valido nel database.
      const postiOccupati = esiste.postiTotali - esiste.postiDisponibili;
      await tx.update(tragitti).set({
        postiTotali: POSTI_QUASI_ILLIMITATI,
        postiDisponibili: Math.max(0, POSTI_QUASI_ILLIMITATI - postiOccupati),
      }).where(eq(tragitti.id, tragittoId));
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

    const tourLeaderId = input.tourLeaderId || undefined;
    const creata = await db.transaction(async (tx) => {
      const lineeEsistenti = await tx.select().from(linee).where(eq(linee.tragittoId, tragittoDelleFermate.id));
      // Una linea ora si può eliminare: il solo conteggio darebbe nomi
      // doppi ("Linea 2" due volte). Si prende il numero dopo il più alto.
      const numeroPiuAlto = lineeEsistenti.reduce((max, l) => Math.max(max, Number(/^Linea (\d+)$/.exec(l.nome)?.[1] ?? 0)), lineeEsistenti.length);
      const [nuovaLinea] = await tx.insert(linee).values({
        tragittoId: tragittoDelleFermate.id,
        nome: `Linea ${numeroPiuAlto + 1}`,
        ordine: lineeEsistenti.reduce((max, l) => Math.max(max, l.ordine + 1), 0),
      }).returning();
      await tx.insert(lineaFermate).values(fermateOrdinate.map((f, ordine) => ({ lineaId: nuovaLinea.id, fermataId: f.id, ordine })));

      const [nuovoBus] = await tx.insert(busFisici).values({
        lineaId: nuovaLinea.id,
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        tourLeaderId,
        costo: input.costo?.toFixed(2),
        postiBus: input.postiBus,
        note: input.note,
      }).returning();

      const passatiAConfermato = await tx.update(tragitti).set({ stato: 'CONFERMATO' })
        .where(and(eq(tragitti.id, tragittoDelleFermate.id), inArray(tragitti.stato, ['DA_CONFERMARE', 'PREZZATO'])))
        .returning({ id: tragitti.id });
      await ricalcolaPostiTragitto(tx, tragittoDelleFermate.id);
      return {
        lineaId: nuovaLinea.id,
        busId: nuovoBus.id,
        tragittoId: tragittoDelleFermate.id,
        // Prima linea confermata del tragitto E passaggio vero a
        // CONFERMATO: è il momento in cui la partenza diventa certa per chi
        // ha prenotato. Le linee da confermare (senza bus) non contano.
        partenzaConfermata: lineeEsistenti.every((l) => l.daConfermare) && passatiAConfermato.length > 0,
      };
    });

    // Avvisi solo a transazione confermata, best effort (non lanciano mai).
    const avvisiClienti = creata.partenzaConfermata
      ? await avvisaPartenzaConfermata(tragittoDelleFermate.id)
      : { clientiAvvisati: 0, emailNonInviate: 0 };
    const tourLeaderAvvisato = tourLeaderId ? await avvisaTourLeader(creata.busId) : null;
    return { ...creata, ...avvisiClienti, tourLeaderAvvisato };
  },

  /** Conferma una linea da confermare (creata in automatico, vedi
   *  linee-da-confermare.service.ts): fermate scelte e primo bus, come
   *  creaLinea. Se è la prima linea confermata del tragitto, la partenza
   *  diventa confermata e chi ha prenotato riceve l'email. */
  async confermaLinea(lineaId: string, input: { riferimento: string; fornitoreId?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string; costo?: number; postiBus: number; note?: string; fermateIds: string[] }) {
    const [linea] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
    if (!linea) throw new ErroreApplicativo('Linea non trovata: potrebbe essere sparita perché non serviva più. Ricarica la pagina.', 404, 'NON_TROVATO');
    if (!linea.daConfermare) throw new ConflittoDati(`${linea.nome} è già confermata: ricarica la pagina.`);
    const fermateTragitto = await db.select({ id: fermate.id, orario: fermate.orario }).from(fermate).where(eq(fermate.tragittoId, linea.tragittoId));
    const fermateScelte = fermateTragitto.filter((f) => input.fermateIds.includes(f.id));
    if (fermateScelte.length === 0) throw new ConflittoDati('Seleziona almeno una fermata per la linea.');
    // Per orario, come creaLinea; quelle senza orario in fondo.
    const fermateOrdinate = [...fermateScelte].sort((a, b) => {
      if (!a.orario && !b.orario) return 0;
      if (!a.orario) return 1;
      if (!b.orario) return -1;
      return a.orario.localeCompare(b.orario);
    });
    const tourLeaderId = input.tourLeaderId || undefined;

    const confermata = await db.transaction(async (tx) => {
      // Stesso lucchetto delle linee automatiche: la linea non sparisce
      // mentre la si conferma.
      await tx.select({ id: tragitti.id }).from(tragitti).where(eq(tragitti.id, linea.tragittoId)).for('update').limit(1);
      const [ancora] = await tx.update(linee).set({ daConfermare: false })
        .where(and(eq(linee.id, lineaId), eq(linee.daConfermare, true)))
        .returning({ id: linee.id });
      if (!ancora) throw new ConflittoDati(`${linea.nome} non è più da confermare: è sparita perché non serviva più, o è già stata confermata. Ricarica la pagina.`);
      const altreConfermate = await tx.select({ id: linee.id }).from(linee)
        .where(and(eq(linee.tragittoId, linea.tragittoId), eq(linee.daConfermare, false), ne(linee.id, lineaId)));

      await tx.delete(lineaFermate).where(eq(lineaFermate.lineaId, lineaId));
      await tx.insert(lineaFermate).values(fermateOrdinate.map((f, ordine) => ({ lineaId, fermataId: f.id, ordine })));
      const [nuovoBus] = await tx.insert(busFisici).values({
        lineaId,
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        tourLeaderId,
        costo: input.costo?.toFixed(2),
        postiBus: input.postiBus,
        note: input.note,
      }).returning();

      const passatiAConfermato = await tx.update(tragitti).set({ stato: 'CONFERMATO' })
        .where(and(eq(tragitti.id, linea.tragittoId), inArray(tragitti.stato, ['DA_CONFERMARE', 'PREZZATO'])))
        .returning({ id: tragitti.id });
      await ricalcolaPostiTragitto(tx, linea.tragittoId);
      return {
        lineaId,
        busId: nuovoBus.id,
        tragittoId: linea.tragittoId,
        partenzaConfermata: altreConfermate.length === 0 && passatiAConfermato.length > 0,
      };
    });

    // Avvisi solo a transazione confermata, best effort (non lanciano mai).
    const avvisiClienti = confermata.partenzaConfermata
      ? await avvisaPartenzaConfermata(confermata.tragittoId)
      : { clientiAvvisati: 0, emailNonInviate: 0 };
    const tourLeaderAvvisato = tourLeaderId ? await avvisaTourLeader(confermata.busId) : null;
    return { ...confermata, ...avvisiClienti, tourLeaderAvvisato };
  },

  /** Aggiunge un ULTERIORE bus a una Linea già esistente — stesse
   *  fermate della Linea (non si ridefiniscono), solo un bus in più
   *  per assorbire più prenotazioni sulle stesse fermate. */
  async aggiungiBusALinea(lineaId: string, input: { riferimento: string; fornitoreId?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string; costo?: number; postiBus: number; note?: string }): Promise<{ busId: string; tragittoId: string; tourLeaderAvvisato: boolean | null }> {
    const [lineaEsiste] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
    if (!lineaEsiste) throw new NonTrovato('Linea');
    // Il primo bus di una linea da confermare arriva con la conferma
    // (fermate e partenza confermata comprese), non da qui.
    if (lineaEsiste.daConfermare) throw new ConflittoDati(`${lineaEsiste.nome} è da confermare: usa "Conferma linea".`);
    const tourLeaderId = input.tourLeaderId || undefined;

    const busId = await db.transaction(async (tx) => {
      const [nuovoBus] = await tx.insert(busFisici).values({
        lineaId,
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        tourLeaderId,
        costo: input.costo?.toFixed(2),
        postiBus: input.postiBus,
        note: input.note,
      }).returning();
      await ricalcolaPostiTragitto(tx, lineaEsiste.tragittoId);
      return nuovoBus.id;
    });
    const tourLeaderAvvisato = tourLeaderId ? await avvisaTourLeader(busId) : null;
    return { busId, tragittoId: lineaEsiste.tragittoId, tourLeaderAvvisato };
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
  async aggiornaBusDiLinea(busId: string, input: { riferimento?: string; fornitoreId?: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string }): Promise<{ tourLeaderAvvisato: boolean | null }> {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');
    // "" dal form = nessun tour leader (null), non un id inesistente.
    const tourLeaderNuovo = input.tourLeaderId !== undefined ? (input.tourLeaderId || null) : undefined;
    // Email solo per un tour leader assegnato ORA (nuovo o diverso da prima).
    const tourLeaderCambiato = tourLeaderNuovo != null && tourLeaderNuovo !== bus.tourLeaderId;
    await db.transaction(async (tx) => {
      await tx.update(busFisici).set({
        ...(input.riferimento !== undefined && { riferimento: input.riferimento }),
        ...(input.fornitoreId !== undefined && { fornitoreId: input.fornitoreId }),
        ...(input.autistaNome !== undefined && { autistaNome: input.autistaNome }),
        ...(input.autistaTelefono !== undefined && { autistaTelefono: input.autistaTelefono }),
        ...(tourLeaderNuovo !== undefined && { tourLeaderId: tourLeaderNuovo }),
        ...(input.costo !== undefined && { costo: input.costo.toFixed(2) }),
        ...(input.postiBus !== undefined && { postiBus: input.postiBus }),
        ...(input.note !== undefined && { note: input.note }),
      }).where(eq(busFisici.id, busId));
      if (input.postiBus !== undefined && bus.lineaId) {
        const [lineaVera] = await tx.select().from(linee).where(eq(linee.id, bus.lineaId)).limit(1);
        if (lineaVera) await ricalcolaPostiTragitto(tx, lineaVera.tragittoId);
      }
    });
    const tourLeaderAvvisato = tourLeaderCambiato ? await avvisaTourLeader(busId) : null;
    return { tourLeaderAvvisato };
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
      // Creata in automatico e senza bus finché non la si conferma.
      daConfermare: l.daConfermare,
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

  /** Elimina una linea con tutti i suoi bus. Le prenotazioni assegnate a
   *  quei bus tornano senza bus (le riprende lo smistamento automatico, e
   *  il nuovo biglietto riparte con il bus nuovo). Non si può togliere
   *  l'ultimo bus di un tragitto con posti venduti. Le linee da confermare
   *  non si eliminano a mano: spariscono da sole quando non servono più. */
  async eliminaLinea(lineaId: string): Promise<{ tragittoId: string }> {
    const [linea] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
    if (!linea) throw new ErroreApplicativo('Linea non trovata: potrebbe essere già stata eliminata.', 404, 'NON_TROVATO');
    if (linea.daConfermare) {
      throw new ConflittoDati(`${linea.nome} è da confermare e sparisce da sola quando non serve più: puoi confermarla, oppure aggiungere un bus a un'altra linea.`);
    }
    await db.transaction(async (tx) => {
      const busLinea = await tx.select({ id: busFisici.id }).from(busFisici).where(eq(busFisici.lineaId, lineaId));
      // bus_fisici → prenotazioni.bus_id va a null da solo (vincolo "set null").
      await tx.delete(busFisici).where(eq(busFisici.lineaId, lineaId));
      await tx.delete(linee).where(eq(linee.id, lineaId));
      // Una linea già senza bus non toglie nessun bus: niente rifiuto.
      await ricalcolaPostiTragitto(tx, linea.tragittoId, busLinea.length > 0 ? 'elimina_linea' : undefined);
    });
    return { tragittoId: linea.tragittoId };
  },

  /** Rimuove un bus dell'evento. Le prenotazioni assegnate tornano senza
   *  bus (le riprende lo smistamento). */
  async rimuoviBus(eventoId: string, busId: string): Promise<{ tragittoId: string | null }> {
    const [bus] = await db.select({ id: busFisici.id, tragittoId: linee.tragittoId, eventoId: tragitti.eventoId }).from(busFisici)
      .leftJoin(linee, eq(linee.id, busFisici.lineaId))
      .leftJoin(tragitti, eq(tragitti.id, linee.tragittoId))
      .where(eq(busFisici.id, busId)).limit(1);
    if (!bus || (bus.eventoId !== null && bus.eventoId !== eventoId)) {
      throw new ErroreApplicativo('Bus non trovato: potrebbe essere già stato rimosso.', 404, 'NON_TROVATO');
    }
    await db.transaction(async (tx) => {
      await tx.delete(busFisici).where(eq(busFisici.id, busId));
      if (bus.tragittoId) await ricalcolaPostiTragitto(tx, bus.tragittoId, 'rimuovi_bus');
    });
    return { tragittoId: bus.tragittoId };
  },

  /** I passeggeri di UN bus: solo le prenotazioni che lo smistamento ha
   *  assegnato a quel bus, per orario della fermata e cognome. */
  async listaPasseggeriBus(eventoId: string, busId: string): Promise<PasseggeroBus[]> {
    const scheda = await leggiSchedaBus(busId);
    if (!scheda || scheda.eventoId !== eventoId) throw busNonTrovato();
    return passeggeriDelBus(busId, scheda.tragittoId);
  },

  /** Il PDF A4 della stessa lista, da stampare. */
  async pdfPasseggeriBus(eventoId: string, busId: string) {
    const scheda = await leggiSchedaBus(busId);
    if (!scheda || scheda.eventoId !== eventoId) throw busNonTrovato();
    return generaPdfPasseggeriBus(busId);
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

      // Le linee da confermare non hanno bus né costi: fuori dal riepilogo.
      const lineeTratta = tutteLeLinee.filter((l) => l.tragittoId === tragitto.id && !l.daConfermare);
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

  /** Il cuore di "Da Confermare": appena le prenotazioni confermate
   *  raggiungono la soglia di pareggio, suggerisce una Linea pronta da
   *  confermare — fornitore, costo e posti presi dal preventivo già
   *  accettato (nessuno da indovinare). Segnala anche le fermate SENZA
   *  prenotazioni (candidate a disattivare: il banner "km cambiati" già
   *  esistente in Linee scatta da solo appena l'admin le disattiva —
   *  nessuna logica di confronto km duplicata qui) e, se una Linea vera
   *  esiste già ma non basta più, che serve un secondo bus. */
  async suggerimentoLinea(tragittoId: string) {
    const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!t) throw new NonTrovato('Tragitto');

    const fermateDelTragitto = await db.select({ id: fermate.id, citta: fermate.citta })
      .from(fermate).where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true)));

    const righeConfermate = await db.select({ citta: prenotazioni.fermataCitta, passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni).where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')));
    const confermatiPerCitta = new Map<string, number>();
    for (const r of righeConfermate) confermatiPerCitta.set(r.citta, (confermatiPerCitta.get(r.citta) ?? 0) + r.passeggeri);
    const totaleConfermati = righeConfermate.reduce((s, r) => s + r.passeggeri, 0);

    // Bus VERI già registrati su questo tragitto (non il tetto "quasi
    // illimitato" — quello non conta come capienza reale).
    const busReali = await db.select({ postiBus: busFisici.postiBus }).from(busFisici)
      .innerJoin(linee, eq(linee.id, busFisici.lineaId)).where(eq(linee.tragittoId, tragittoId));
    const capienzaReale = busReali.reduce((s, b) => s + (b.postiBus ?? 0), 0);
    const lineaGiaConfermata = busReali.length > 0;

    if (lineaGiaConfermata) {
      return {
        pronta: false, lineaGiaConfermata: true,
        serveSecondoBus: totaleConfermati > capienzaReale,
        totaleConfermati, capienzaReale,
      } as const;
    }

    if (!t.preventivoCosto || !t.preventivoPostiBus) {
      // Non dovrebbe capitare (i prezzi si calcolano solo da un
      // preventivo già noto), ma se capita non c'è nulla da suggerire.
      return { pronta: false, lineaGiaConfermata: false, serveSecondoBus: false, totaleConfermati, capienzaReale: 0 } as const;
    }

    const soglia = await leggiSogliaOccupazionePareggio();
    const postiDiPareggio = Math.round(t.preventivoPostiBus * (soglia / 100));
    if (totaleConfermati < postiDiPareggio) {
      return { pronta: false, lineaGiaConfermata: false, serveSecondoBus: false, totaleConfermati, postiDiPareggio, capienzaReale: 0 } as const;
    }

    const fermateSenzaPrenotazioni = fermateDelTragitto.filter((f) => !(confermatiPerCitta.get(f.citta) ?? 0));

    return {
      pronta: true, lineaGiaConfermata: false, serveSecondoBus: false,
      totaleConfermati, postiDiPareggio, capienzaReale: 0,
      fornitoreId: t.fornitoreId, costo: t.preventivoCosto ? Number(t.preventivoCosto) : null, postiBus: t.preventivoPostiBus,
      fermateSenzaPrenotazioni,
    } as const;
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
      .where(and(eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
    if (righeTragitti.length === 0) return 0;

    const tragittiIds = righeTragitti.map((r) => r.tragittoId);
    const fermateConOrario = await db.select({ tragittoId: fermate.tragittoId, orario: fermate.orario })
      .from(fermate).where(inArray(fermate.tragittoId, tragittiIds));
    const conOrario = new Set(fermateConOrario.filter((f) => f.orario).map((f) => f.tragittoId));
    const senzaOrario = righeTragitti.filter((r) => !conOrario.has(r.tragittoId));
    return new Set(senzaOrario.map((r) => r.eventoId)).size;
  },

  /** Eventi con almeno un tragitto già pronto per chiedere un
   *  preventivo (orario impostato) ma senza ancora un fornitore
   *  accettato — il segnale "c'è qualcosa da fare in Preventivi",
   *  distinto da "risposte arrivate da valutare" (contaDaValutare, nel
   *  modulo preventivi) che invece guarda le richieste già inviate. */
  /** Quanti EVENTI hanno almeno una linea da confermare (creata in
   *  automatico: soglia di pareggio raggiunta, o bus pieni) — il pallino
   *  su "Da confermare" nel menu. Solo tragitti attivi di eventi non
   *  passati e non nel cestino. */
  async contaLineeProntoDaConfermare() {
    const righe = await db.selectDistinct({ eventoId: tragitti.eventoId }).from(linee)
      .innerJoin(tragitti, eq(tragitti.id, linee.tragittoId))
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(
        eq(linee.daConfermare, true), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl),
        isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`,
      ));
    return righe.length;
  },

  async contaEventiPreventiviDaRichiedere() {
    const righeTragitti = await db
      .select({ eventoId: tragitti.eventoId, tragittoId: tragitti.id, fornitoreId: tragitti.fornitoreId })
      .from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`, isNull(tragitti.fornitoreId)));
    if (righeTragitti.length === 0) return 0;

    const tragittiIds = righeTragitti.map((r) => r.tragittoId);
    const fermateConOrarioPerPreventivo = await db.select({ tragittoId: fermate.tragittoId, orario: fermate.orario })
      .from(fermate).where(inArray(fermate.tragittoId, tragittiIds));
    const conOrarioPerPreventivo = new Set(fermateConOrarioPerPreventivo.filter((f) => f.orario).map((f) => f.tragittoId));
    const pronti = righeTragitti.filter((r) => conOrarioPerPreventivo.has(r.tragittoId));
    return new Set(pronti.map((r) => r.eventoId)).size;
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
      .where(and(eq(tragitti.stato, 'DA_CONFERMARE'), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), isNull(eventi.eliminatoIl), sql`${eventi.data} >= now()`));
    return new Set(righe.map((r) => r.eventoId)).size;
  },

  /** Eventi con almeno un tragitto già prezzato ma senza ancora
   *  nessuna Linea costruita — questo, e non lo stato interno
   *  "DA_CONFERMARE" (un nome simile ma un concetto diverso), è il
   *  conteggio giusto per la tappa di menu "Da Confermare". */
  async contaAllertePartenze(): Promise<number> {
    const perEvento = await eventiService.allertePartenzePerEvento();
    return Object.values(perEvento).reduce((somma, n) => somma + n, 0);
  },

  /** Come sopra, ma per singolo evento — quante tratte con posti
   *  superati ha OGNI evento (non solo il totale generale), usata per
   *  mostrare il pallino di avviso sulla card dell'evento specifico
   *  nella sezione Partenze, non solo nel menu laterale. Contano i posti
   *  dei bus veri dei tragitti confermati: quelli in vendita restano
   *  "quasi illimitati". */
  async allertePartenzePerEvento(): Promise<Record<string, number>> {
    const righeTragitti = await db.select({ tragittoId: tragitti.id, eventoId: tragitti.eventoId }).from(tragitti)
      .where(and(eq(tragitti.stato, 'CONFERMATO'), isNull(tragitti.eliminatoIl)));
    if (righeTragitti.length === 0) return {};
    const tragittiIds = righeTragitti.map((r) => r.tragittoId);

    const somme = await db
      .select({ tragittoId: prenotazioni.tragittoId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA')))
      .groupBy(prenotazioni.tragittoId);
    const mappaPasseggeri = new Map(somme.map((s) => [s.tragittoId, Number(s.totale)]));
    const { postiSuiBus } = await postiBusELineeDaConfermare(tragittiIds);

    const risultato: Record<string, number> = {};
    for (const r of righeTragitti) {
      const passeggeri = mappaPasseggeri.get(r.tragittoId) ?? 0;
      if (passeggeri === 0) continue; // niente da coprire, non è un allarme
      if ((postiSuiBus.get(r.tragittoId) ?? 0) < passeggeri) risultato[r.eventoId] = (risultato[r.eventoId] ?? 0) + 1;
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
      fornitoreId: tragitti.fornitoreId,
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
      // isNull(tragitti.eliminatoIl): un tragitto rimosso dalla scheda
      // evento resta attivo=true (il soft-delete tocca solo eliminatoIl)
      // — senza questo filtro continuava a comparire in Partenze e a
      // contare nei badge del menu. Stesso fix nei tre conteggi sopra.
      .where(and(eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), isNull(eventi.eliminatoIl)));

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

    // Posti dei bus veri e linee da confermare: postiTotali resta "quasi
    // illimitato" (le vendite non si fermano per i bus).
    const { postiSuiBus, lineeDaConfermare } = await postiBusELineeDaConfermare(tragittiIds);

    return righe.map((r) => ({
      tragittoId: r.tragittoId,
      tragittoNome: r.tragittoNome,
      stato: r.stato,
      postiTotali: r.postiTotali,
      postiSuiBus: postiSuiBus.get(r.tragittoId) ?? 0,
      lineeDaConfermare: lineeDaConfermare.get(r.tragittoId) ?? 0,
      totalePasseggeri: mappaPasseggeri.get(r.tragittoId) ?? 0,
      preventivoCosto: r.preventivoCosto,
      fornitoreId: r.fornitoreId,
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

  /** "Ferma vendite" sulla card dell'evento in Eventi: l'evento sparisce dal
   *  sito (elenchi, tour, bundle, sitemap) e nessuno può più prenotarlo,
   *  nemmeno con il link o dal widget White Label; la pagina dell'evento
   *  dice che le prenotazioni sono chiuse. Chi ha già prenotato non cambia
   *  nulla. */
  async impostaVenditeFermate(eventoId: string, fermate: boolean): Promise<boolean> {
    const [aggiornato] = await db.update(eventi).set({ venditeFermate: fermate })
      .where(eq(eventi.id, eventoId))
      .returning({ venditeFermate: eventi.venditeFermate });
    if (!aggiornato) throw new NonTrovato('Evento');
    return aggiornato.venditeFermate;
  },
};
