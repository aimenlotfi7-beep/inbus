import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { eq, and, asc, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { preventiviRichieste, preventiviRisposte, fornitori, tragitti, eventi, fermate, linee, lineaFermate } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { urlSito } from '../../shared/email.service.js';
import { leggiRaggioKmPreventivo, leggiGiorniValiditaLinkPreventivo } from '../impostazioni/impostazioni.routes.js';
import { limitePnr } from '../../shared/rateLimit.js';
import { distanzaKm, calcolaKmApprossimati } from '../../shared/distanza.js';
import { inizioOggiRoma } from '../../shared/formato.js';
import { classificaCandidato, destinatariRichiesta, type StatoCandidato } from './classifica-candidato.js';
import { cambiPercorso, fotografiaPercorso, richiestaAperta } from './cambio-percorso.js';
import { fermateInOrdine, inviaEmailModello, testoFermate, tragittoConEvento, variabiliTragitto } from './email-fornitori.js';

/** Due tipi di richiesta ai fornitori (deciso dal proprietario, settembre 2026):
 *  - QUOTAZIONE, per il tragitto: un prezzo indicativo di un bus sul percorso
 *    intero, che serve solo a calcolare i prezzi di vendita. Sceglierla non
 *    impegna nessuno: nessuna mail di "scelto" o "non scelto", niente file
 *    firmato.
 *  - BUS, per una proposta da confermare (Partenze → Da confermare): il
 *    preventivo vero di quel bus, chiesto quando la proposta nasce. Il
 *    fornitore scelto diventa il fornitore del bus, riceve la mail e il file
 *    firmato; ogni bus può avere un fornitore diverso. Chi ha dato la
 *    quotazione ha la precedenza: è sempre tra i fornitori proposti, già
 *    selezionato. */

function generaToken() {
  return crypto.randomBytes(24).toString('hex');
}

const MESSAGGIO_QUOTAZIONE_SCELTA = 'La quotazione per questo viaggio è già stata scelta.';
const MESSAGGIO_BUS_ASSEGNATO = 'Il bus per questo viaggio è già stato assegnato.';
const MESSAGGIO_BUS_NON_SERVE = 'Al momento questo bus non serve più: se servirà di nuovo, questa richiesta tornerà attiva.';

const richiediSchema = z.object({
  // Coordinate della partenza — geocodificate nel browser (vedi
  // schema.ts, tragitti.partenzaLat/Lng) e passate qui la prima volta;
  // se il tragitto le ha già salvate, il frontend può ometterle.
  lat: z.number().optional(),
  lng: z.number().optional(),
  raggioKm: z.number().positive().optional(),
  // Solo i fornitori scelti a mano (manuale) — quelli con invio
  // automatico attivo, nel raggio e mai contattati prima, partono da
  // soli indipendentemente da questa lista.
  fornitoriManualiIds: z.array(z.string()).default([]),
  // Nuova richiesta perché il percorso è cambiato dopo la quotazione
  // scelta: si possono scegliere anche i fornitori già contattati, e
  // possono rispondere anche se il viaggio ha già una quotazione.
  perCambioPercorso: z.boolean().optional(),
});

const richiediBusSchema = z.object({
  // La prima fermata del bus, geocodificata nel browser.
  lat: z.number(),
  lng: z.number(),
  raggioKm: z.number().positive().optional(),
  fornitoriManualiIds: z.array(z.string()).default([]),
});

// Limite per singolo allegato, lato server (il cap globale di Express a
// 15MB protegge il processo, non la tabella): un PDF di preventivo sta
// in pochi MB, oltre è quasi certamente un errore o un abuso. In base64
// 8MB di file diventano ~10.7M caratteri.
const MAX_FILE_BASE64 = 8 * 1024 * 1024 * 4 / 3;
const fileBase64Schema = z.string().max(MAX_FILE_BASE64, 'Il file supera gli 8MB consentiti.');

const rispondiSchema = z.object({
  prezzo: z.number().positive(),
  // Facoltativo solo per le pagine aperte prima di settembre 2026: il modulo lo chiede sempre.
  postiBus: z.number().int().min(1).max(200).optional(),
  fileNome: z.string().max(200).optional(),
  fileContenuto: fileBase64Schema.optional(), // base64
});

function scadutoDopoGiorni(creataIl: Date, giorni: number): boolean {
  return Date.now() - new Date(creataIl).getTime() > giorni * 24 * 60 * 60 * 1000;
}

/** Il link è scaduto se la richiesta è più vecchia dei giorni impostati
 *  E non ha ancora una risposta (chi ha risposto rivede sempre la sua). */
async function linkScaduto(richiesta: { creataIl: Date }, giaRisposto: boolean): Promise<boolean> {
  if (giaRisposto) return false;
  return scadutoDopoGiorni(richiesta.creataIl, await leggiGiorniValiditaLinkPreventivo());
}

/** Fornitori APPROVATI nel raggio, classificati per la scelta manuale
 *  (classifica-candidato.ts). `contattatiIds`: già contattati per questa
 *  stessa richiesta. `fornitoreQuotazioneId`: chi ha dato la quotazione del
 *  tragitto, sempre tra i candidati (anche fuori raggio) e in cima. */
async function candidatiVicini(lat: number, lng: number, raggioKm: number, contesto: { contattatiIds: ReadonlySet<string>; fornitoreQuotazioneId: string | null; quotazioneSempre: boolean }) {
  const tutti = await db.select().from(fornitori).where(eq(fornitori.stato, 'APPROVATO'));
  const distanza = (f: typeof fornitori.$inferSelect) => (f.lat != null && f.lng != null ? distanzaKm(lat, lng, f.lat, f.lng) : null);
  const scelti = tutti.filter((f) => {
    const km = distanza(f);
    return (km != null && km <= raggioKm) || (contesto.quotazioneSempre && f.id === contesto.fornitoreQuotazioneId);
  });
  return scelti.map((f) => {
    const statoCandidato: StatoCandidato = contesto.quotazioneSempre && contesto.contattatiIds.has(f.id)
      ? 'gia_contattato'
      : classificaCandidato(f, { fornitoreAccettatoId: contesto.fornitoreQuotazioneId, contattatiIds: contesto.contattatiIds });
    return { ...f, distanzaKm: Math.round(distanza(f) ?? 0), statoCandidato };
  }).sort((a, b) => Number(b.id === contesto.fornitoreQuotazioneId) - Number(a.id === contesto.fornitoreQuotazioneId) || a.distanzaKm - b.distanzaKm);
}

async function candidatiPerTragitto(tragittoId: string, lat: number, lng: number, raggioKm: number) {
  const { tragitto } = await tragittoConEvento(tragittoId);
  const giaContattati = await db.select({ fornitoreId: preventiviRichieste.fornitoreId }).from(preventiviRichieste)
    .where(and(eq(preventiviRichieste.tragittoId, tragittoId), eq(preventiviRichieste.scopo, 'QUOTAZIONE')));
  return candidatiVicini(lat, lng, raggioKm, { contattatiIds: new Set(giaContattati.map((r) => r.fornitoreId)), fornitoreQuotazioneId: tragitto.fornitoreId, quotazioneSempre: false });
}

/** La proposta da confermare per cui si chiedono i preventivi di un bus. */
async function propostaAperta(lineaId: string) {
  const [linea] = await db.select().from(linee).where(eq(linee.id, lineaId)).limit(1);
  if (!linea || !linea.daConfermare) throw new ConflittoDati('Questa proposta non c\'è più o è già stata confermata: ricarica la pagina.');
  const righeFermate = await db.select({ fermataId: lineaFermate.fermataId }).from(lineaFermate)
    .where(eq(lineaFermate.lineaId, lineaId)).orderBy(asc(lineaFermate.ordine));
  return { linea, fermateIds: righeFermate.map((r) => r.fermataId) };
}

async function candidatiPerBus(lineaId: string, lat: number, lng: number, raggioKm: number) {
  const { linea } = await propostaAperta(lineaId);
  const { tragitto } = await tragittoConEvento(linea.tragittoId);
  const giaContattati = await db.select({ fornitoreId: preventiviRichieste.fornitoreId }).from(preventiviRichieste)
    .where(and(eq(preventiviRichieste.lineaId, lineaId), eq(preventiviRichieste.scopo, 'BUS'), isNull(preventiviRichieste.chiusaIl)));
  return candidatiVicini(lat, lng, raggioKm, { contattatiIds: new Set(giaContattati.map((r) => r.fornitoreId)), fornitoreQuotazioneId: tragitto.fornitoreId, quotazioneSempre: true });
}

type EsitoRichiesta = 'inviata' | 'non_inviata' | 'senza_email';
type RigaRichiesta = typeof preventiviRichieste.$inferSelect;

/** Quale mail per una richiesta, con i suoi segnaposto. */
async function emailRichiesta(richiesta: Pick<RigaRichiesta, 'tragittoId' | 'scopo' | 'lineaId' | 'fermateIds' | 'perCambioPercorso' | 'token'>) {
  const { tragitto, evento } = await tragittoConEvento(richiesta.tragittoId);
  const variabili: Record<string, string> = { ...variabiliTragitto(tragitto, evento), link: urlSito(`/fornitore/preventivo/${richiesta.token}`) };
  if (richiesta.scopo !== 'BUS') {
    return { chiave: richiesta.perCambioPercorso ? 'preventivo_richiesta_cambio_percorso' : 'preventivo_richiesta', variabili };
  }
  const [linea] = richiesta.lineaId ? await db.select({ nome: linee.nome }).from(linee).where(eq(linee.id, richiesta.lineaId)).limit(1) : [];
  return {
    chiave: 'preventivo_bus_richiesta',
    variabili: {
      ...variabili,
      bus: linea?.nome ?? 'bus',
      fermate: testoFermate(await fermateInOrdine(richiesta.fermateIds ?? [])),
      posti: tragitto.preventivoPostiBus ? String(tragitto.preventivoPostiBus) : 'da indicare',
    },
  };
}

/** Perché non si può più rispondere a una richiesta (null = si può). */
function motivoChiusura(
  richiesta: Pick<RigaRichiesta, 'scopo' | 'lineaId' | 'chiusaIl' | 'perCambioPercorso' | 'creataIl'>,
  tragitto: { fornitoreId: string | null; percorsoPreventivoIl: Date | null },
): string | null {
  if (richiesta.scopo === 'BUS') {
    if (richiesta.chiusaIl) return MESSAGGIO_BUS_ASSEGNATO;
    return richiesta.lineaId ? null : MESSAGGIO_BUS_NON_SERVE;
  }
  // Quotazione: finché il viaggio non ne ha una scelta, o per un cambio di percorso della tornata in corso.
  const aperta = !tragitto.fornitoreId || (richiesta.perCambioPercorso && richiestaAperta(richiesta.creataIl, tragitto.percorsoPreventivoIl));
  return aperta ? null : MESSAGGIO_QUOTAZIONE_SCELTA;
}

async function inviaRichiestaSingola(
  fornitore: typeof fornitori.$inferSelect,
  tipoInvio: 'AUTOMATICO' | 'MANUALE',
  dati: Pick<RigaRichiesta, 'tragittoId'> & Partial<Pick<RigaRichiesta, 'scopo' | 'lineaId' | 'fermateIds' | 'perCambioPercorso'>>,
): Promise<EsitoRichiesta> {
  const [richiesta] = await db.insert(preventiviRichieste).values({ ...dati, fornitoreId: fornitore.id, token: generaToken(), tipoInvio }).returning();
  if (!fornitore.email) return 'senza_email'; // registrato ma non contattabile: la richiesta resta in lista
  const { chiave, variabili } = await emailRichiesta(richiesta);
  return (await inviaEmailModello(fornitore.email, chiave, variabili)) ? 'inviata' : 'non_inviata';
}

/** Manda il file firmato al fornitore (allegato PDF). */
function inviaFileFirmato(email: string, fileNome: string, fileContenuto: string): Promise<boolean> {
  return inviaEmailModello(email, 'preventivo_firmato', {}, [
    { nomeFile: fileNome, contenuto: Buffer.from(fileContenuto, 'base64'), tipo: 'application/pdf' },
  ]);
}

/** Invia a automatici e scelti a mano; conteggi veri (vedi richiedi). */
async function inviaATutti(candidati: Awaited<ReturnType<typeof candidatiVicini>>, manualiIds: string[], opzioni: { cambioPercorso?: boolean }, dati: Parameters<typeof inviaRichiestaSingola>[2]) {
  const { automatici, manuali } = destinatariRichiesta(candidati, new Set(manualiIds), opzioni);
  const esito = { inviateAutomatiche: 0, inviateManuali: 0, nonInviate: 0, senzaEmail: 0 };
  const conta = (r: EsitoRichiesta, campoInviate: 'inviateAutomatiche' | 'inviateManuali') => {
    if (r === 'inviata') esito[campoInviate]++;
    else if (r === 'non_inviata') esito.nonInviate++;
    else esito.senzaEmail++;
  };
  for (const f of automatici) conta(await inviaRichiestaSingola(f, 'AUTOMATICO', dati), 'inviateAutomatiche');
  for (const f of manuali) conta(await inviaRichiestaSingola(f, 'MANUALE', dati), 'inviateManuali');
  return esito;
}

/** Le richieste con la loro risposta (solo i metadati: gli allegati si
 *  scaricano a parte con /risposte/:id/file quando servono). */
async function richiesteConRisposte(richieste: RigaRichiesta[], percorsoPreventivoIl: Date | null) {
  if (richieste.length === 0) return [];
  const fornitoriRighe = await db.select().from(fornitori).where(inArray(fornitori.id, [...new Set(richieste.map((r) => r.fornitoreId))]));
  const risposte = await db.select({
    id: preventiviRisposte.id, richiestaId: preventiviRisposte.richiestaId, prezzo: preventiviRisposte.prezzo, postiBus: preventiviRisposte.postiBus,
    busId: preventiviRisposte.busId,
    fileNome: preventiviRisposte.fileNome, fileFirmatoNome: preventiviRisposte.fileFirmatoNome,
    fileFirmatoInviatoIl: preventiviRisposte.fileFirmatoInviatoIl, inviataIl: preventiviRisposte.inviataIl,
    haFile: sql<boolean>`${preventiviRisposte.fileContenuto} IS NOT NULL`,
    haFileFirmato: sql<boolean>`${preventiviRisposte.fileFirmatoContenuto} IS NOT NULL`,
  }).from(preventiviRisposte).where(inArray(preventiviRisposte.richiestaId, richieste.map((r) => r.id)));
  const giorniValidita = await leggiGiorniValiditaLinkPreventivo();
  const fornitorePerId = new Map(fornitoriRighe.map((f) => [f.id, f]));
  const rispostaPerRichiesta = new Map(risposte.map((r) => [r.richiestaId, r]));
  return richieste.map((r) => {
    const fornitore = fornitorePerId.get(r.fornitoreId);
    const risposta = rispostaPerRichiesta.get(r.id) ?? null;
    // Le richieste per cambio percorso sono della tornata in corso ("aperta")
    // o di un cambio già risolto ("chiusa").
    const cambioPercorso: 'aperta' | 'chiusa' | null = r.perCambioPercorso
      ? (richiestaAperta(r.creataIl, percorsoPreventivoIl) ? 'aperta' : 'chiusa')
      : null;
    return {
      richiestaId: r.id,
      fornitoreNome: fornitore?.nome ?? '',
      creataIl: r.creataIl,
      haRisposta: !!risposta,
      linkScaduto: !risposta && scadutoDopoGiorni(r.creataIl, giorniValidita),
      cambioPercorso,
      richiesta: r,
      fornitore,
      risposta,
    };
  });
}

export const preventiviService = {
  candidatiPerTragitto,
  candidatiPerBus,
  /** Richiesta di QUOTAZIONE per il tragitto. Conteggi veri: inviate* =
   *  email davvero partite; nonInviate = tentate ma non partite; senzaEmail
   *  = fornitori senza indirizzo (la loro richiesta resta registrata). */
  richiedi: async (tragittoId: string, input: z.infer<typeof richiediSchema>) => {
    const { tragitto } = await tragittoConEvento(tragittoId);
    let lat = tragitto.partenzaLat, lng = tragitto.partenzaLng;
    if (input.lat != null && input.lng != null) {
      lat = input.lat; lng = input.lng;
      // Prima volta (o indirizzo di partenza cambiato) — salva per non
      // dover rigeocodificare alle prossime richieste sullo stesso
      // tragitto.
      await db.update(tragitti).set({ partenzaLat: lat, partenzaLng: lng }).where(eq(tragitti.id, tragittoId));
    }
    if (lat == null || lng == null) throw new ConflittoDati('Manca la posizione della partenza — geocodificala prima di procedere.');
    const raggioKm = input.raggioKm ?? await leggiRaggioKmPreventivo();
    const candidati = await candidatiPerTragitto(tragittoId, lat, lng, raggioKm);
    // Per un cambio di percorso anche i fornitori già contattati si possono
    // scegliere di nuovo, e ricevono la mail che spiega il cambio.
    const perCambioPercorso = !!input.perCambioPercorso;
    return inviaATutti(candidati, input.fornitoriManualiIds, { cambioPercorso: perCambioPercorso }, { tragittoId, scopo: 'QUOTAZIONE', perCambioPercorso });
  },
  /** Richiesta di preventivo per il BUS di una proposta da confermare, ai
   *  fornitori vicini alla sua prima fermata (e a chi ha dato la quotazione). */
  richiediBus: async (lineaId: string, input: z.infer<typeof richiediBusSchema>) => {
    const { linea, fermateIds } = await propostaAperta(lineaId);
    if (fermateIds.length === 0) throw new ConflittoDati('Questa proposta non ha fermate.');
    const raggioKm = input.raggioKm ?? await leggiRaggioKmPreventivo();
    const candidati = await candidatiPerBus(lineaId, input.lat, input.lng, raggioKm);
    return inviaATutti(candidati, input.fornitoriManualiIds, {}, { tragittoId: linea.tragittoId, scopo: 'BUS', lineaId, fermateIds });
  },
  /** Rimanda la stessa richiesta (stesso token, stesso link) a un
   *  fornitore che non ha ancora risposto. Se il link era scaduto,
   *  riparte il conteggio dei giorni da adesso, così torna valido. */
  reinviaRichiesta: async (richiestaId: string) => {
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, richiestaId)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    const [risposta] = await db.select({ id: preventiviRisposte.id }).from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, richiesta.id)).limit(1);
    if (risposta) throw new ConflittoDati('Questo fornitore ha già risposto alla richiesta: non serve reinviarla.');
    const [fornitore] = await db.select().from(fornitori).where(eq(fornitori.id, richiesta.fornitoreId)).limit(1);
    if (!fornitore?.email) throw new ConflittoDati('Questo fornitore non ha un indirizzo email: aggiungilo nella sua scheda prima di reinviare la richiesta.');
    const { tragitto } = await tragittoConEvento(richiesta.tragittoId);
    const chiusa = motivoChiusura(richiesta, tragitto);
    if (chiusa) throw new ConflittoDati(chiusa);

    if (await linkScaduto(richiesta, false)) {
      await db.update(preventiviRichieste).set({ creataIl: new Date() }).where(eq(preventiviRichieste.id, richiesta.id));
    }
    const { chiave, variabili } = await emailRichiesta(richiesta);
    return { inviata: await inviaEmailModello(fornitore.email, chiave, variabili) };
  },
  /** Le richieste di QUOTAZIONE del tragitto, con le risposte. */
  listaPerTragitto: async (tragittoId: string) => {
    const richieste = await db.select().from(preventiviRichieste)
      .where(and(eq(preventiviRichieste.tragittoId, tragittoId), eq(preventiviRichieste.scopo, 'QUOTAZIONE')));
    const [tragittoRiga] = await db.select({ percorsoPreventivoIl: tragitti.percorsoPreventivoIl }).from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    return richiesteConRisposte(richieste, tragittoRiga?.percorsoPreventivoIl ?? null);
  },
  /** I preventivi chiesti per il bus di una proposta da confermare. */
  listaPerProposta: async (lineaId: string) => {
    const richieste = await db.select().from(preventiviRichieste)
      .where(and(eq(preventiviRichieste.lineaId, lineaId), eq(preventiviRichieste.scopo, 'BUS'), isNull(preventiviRichieste.chiusaIl)));
    return richiesteConRisposte(richieste, null);
  },
  /** Solo l'allegato, quando serve davvero (clic su "Scarica"). */
  fileRisposta: async (rispostaId: string, quale: 'originale' | 'firmato') => {
    const [r] = await db.select({
      nome: quale === 'originale' ? preventiviRisposte.fileNome : preventiviRisposte.fileFirmatoNome,
      contenuto: quale === 'originale' ? preventiviRisposte.fileContenuto : preventiviRisposte.fileFirmatoContenuto,
    }).from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!r || !r.contenuto) throw new NonTrovato('Allegato');
    return { nome: r.nome ?? 'preventivo.pdf', contenuto: r.contenuto };
  },
  getPubblico: async (token: string) => {
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.token, token)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    const { tragitto, evento } = await tragittoConEvento(richiesta.tragittoId);
    const perBus = richiesta.scopo === 'BUS';
    // Quotazione: le fermate attive di adesso, in ordine (dopo un cambio di
    // percorso il fornitore vede quello aggiornato). Bus: quelle del bus.
    const righeFermate = perBus
      ? await fermateInOrdine(richiesta.fermateIds ?? [])
      : await db.select().from(fermate)
        .where(and(eq(fermate.tragittoId, richiesta.tragittoId), eq(fermate.attivo, true)))
        .orderBy(asc(fermate.ordine));
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, richiesta.id)).limit(1);
    const [linea] = perBus && richiesta.lineaId ? await db.select({ nome: linee.nome }).from(linee).where(eq(linee.id, richiesta.lineaId)).limit(1) : [];
    const chiusa = motivoChiusura(richiesta, tragitto);
    return {
      scopo: richiesta.scopo,
      tragitto: { nome: tragitto.nome, arrivoCitta: tragitto.arrivoCitta, arrivoOrario: tragitto.arrivoOrario },
      evento: evento ? { artista: evento.artista, data: evento.data, luogo: evento.luogo, citta: evento.citta } : null,
      fermate: righeFermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario })),
      // Solo per un bus: il nome della proposta e i posti di riferimento.
      bus: perBus ? { nome: linea?.nome ?? null, postiRiferimento: tragitto.preventivoPostiBus } : null,
      // Definitiva una volta inviata — se già risposto, il form
      // pubblico mostra sola lettura invece dei campi da compilare.
      giaRisposto: !!risposta,
      scaduto: await linkScaduto(richiesta, !!risposta),
      // Non si può più rispondere: il testo spiega perché.
      giaAssegnato: !!chiusa,
      motivoChiusura: chiusa,
      perCambioPercorso: richiesta.perCambioPercorso && richiestaAperta(richiesta.creataIl, tragitto.percorsoPreventivoIl),
      risposta: risposta ? { prezzo: risposta.prezzo, postiBus: risposta.postiBus, fileNome: risposta.fileNome } : null,
    };
  },
  rispondi: async (token: string, input: z.infer<typeof rispondiSchema>) => {
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.token, token)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    const [esistente] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, richiesta.id)).limit(1);
    if (esistente) throw new ConflittoDati('Hai già inviato una risposta per questa richiesta — per modificarla, contatta direttamente chi ti ha scritto.');
    const { tragitto } = await tragittoConEvento(richiesta.tragittoId);
    const chiusa = motivoChiusura(richiesta, tragitto);
    if (chiusa) throw new ConflittoDati(chiusa);
    if (await linkScaduto(richiesta, false)) throw new ConflittoDati('Questo link è scaduto — se vuole ancora inviare un preventivo, contatti direttamente chi le ha scritto.');
    try {
      const [nuova] = await db.insert(preventiviRisposte).values({
        richiestaId: richiesta.id,
        prezzo: input.prezzo.toFixed(2),
        postiBus: input.postiBus,
        fileNome: input.fileNome,
        fileContenuto: input.fileContenuto,
      }).returning();
      return { id: nuova.id, prezzo: nuova.prezzo, postiBus: nuova.postiBus, fileNome: nuova.fileNome };
    } catch (e) {
      // Doppio invio quasi simultaneo (doppio click): il controllo sopra
      // passa per entrambi, il vincolo unique ferma il secondo — lo
      // traduco nello stesso 409 del caso normale, non in un 500.
      if (e instanceof Error && 'code' in e && (e as { code?: string }).code === '23505') {
        throw new ConflittoDati('Hai già inviato una risposta per questa richiesta — per modificarla, contatta direttamente chi ti ha scritto.');
      }
      throw e;
    }
  },
  /** Sceglie una risposta come QUOTAZIONE del tragitto: costo, posti e
   *  fornitore di riferimento per i prezzi. Nessuna email: la quotazione è
   *  indicativa. Il percorso di adesso diventa quello della quotazione
   *  (chiude anche un "percorso cambiato"). */
  accetta: async (rispostaId: string) => {
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!risposta) throw new NonTrovato('Risposta preventivo');
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, risposta.richiestaId)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    if (richiesta.scopo === 'BUS') throw new ConflittoDati('Il preventivo di un bus si sceglie confermando il bus, in Da confermare.');
    await db.update(tragitti).set({
      preventivoCosto: risposta.prezzo,
      fornitoreId: richiesta.fornitoreId,
      // I posti del bus offerto, se il fornitore li ha indicati: senza, restano quelli di prima.
      ...(risposta.postiBus != null && { preventivoPostiBus: risposta.postiBus }),
      ...(await fotografiaPercorso(richiesta.tragittoId)),
    }).where(eq(tragitti.id, richiesta.tragittoId));
    return { ok: true as const };
  },
  /** Salva il file firmato e lo manda al fornitore; la data di invio si
   *  scrive SOLO se l'email è partita davvero (un file nuovo azzera
   *  quella del file precedente). Solo per il preventivo di un bus scelto:
   *  la quotazione non impegna nessuno. */
  caricaFileFirmato: async (rispostaId: string, fileNome: string, fileContenuto: string) => {
    const [risposta] = await db.select({ id: preventiviRisposte.id, richiestaId: preventiviRisposte.richiestaId, busId: preventiviRisposte.busId }).from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!risposta) throw new NonTrovato('Risposta preventivo');
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, risposta.richiestaId)).limit(1);
    if (richiesta?.scopo !== 'BUS' || !risposta.busId) throw new ConflittoDati('Il file firmato si manda solo per il preventivo di un bus confermato.');
    const [fornitore] = await db.select().from(fornitori).where(eq(fornitori.id, richiesta.fornitoreId)).limit(1);
    await db.update(preventiviRisposte).set({ fileFirmatoNome: fileNome, fileFirmatoContenuto: fileContenuto, fileFirmatoInviatoIl: null }).where(eq(preventiviRisposte.id, rispostaId));
    const inviata = fornitore?.email ? await inviaFileFirmato(fornitore.email, fileNome, fileContenuto) : false;
    if (inviata) {
      await db.update(preventiviRisposte).set({ fileFirmatoInviatoIl: new Date() }).where(eq(preventiviRisposte.id, rispostaId));
    }
    return { ok: true as const, inviata };
  },
  /** Rimanda il file firmato già salvato (es. il primo invio non era partito). */
  reinviaFileFirmato: async (rispostaId: string) => {
    const [risposta] = await db.select({
      id: preventiviRisposte.id, richiestaId: preventiviRisposte.richiestaId,
      fileFirmatoNome: preventiviRisposte.fileFirmatoNome, fileFirmatoContenuto: preventiviRisposte.fileFirmatoContenuto,
    }).from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!risposta) throw new NonTrovato('Risposta preventivo');
    if (!risposta.fileFirmatoContenuto) throw new ConflittoDati('Non c\'è ancora un preventivo firmato da reinviare: caricalo prima.');
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, risposta.richiestaId)).limit(1);
    const [fornitore] = richiesta ? await db.select().from(fornitori).where(eq(fornitori.id, richiesta.fornitoreId)).limit(1) : [];
    if (!fornitore?.email) throw new ConflittoDati('Questo fornitore non ha un indirizzo email: aggiungilo nella sua scheda prima di reinviare il file.');
    const inviata = await inviaFileFirmato(fornitore.email, risposta.fileFirmatoNome ?? 'preventivo-firmato.pdf', risposta.fileFirmatoContenuto);
    if (inviata) {
      await db.update(preventiviRisposte).set({ fileFirmatoInviatoIl: new Date() }).where(eq(preventiviRisposte.id, rispostaId));
    }
    return { inviata };
  },
  /** Per gli avvisi delle Statistiche: tragitti con risposte di quotazione
   *  e ancora senza quotazione scelta (né accettata né registrata a mano),
   *  come il rosso "risposte da valutare" in Partenze → Quotazione. Solo
   *  tragitti attivi di eventi in programma, non in bozza e non nel cestino. */
  contaDaValutare: async () => {
    const righe = await db.selectDistinct({ tragittoId: preventiviRichieste.tragittoId }).from(preventiviRisposte)
      .innerJoin(preventiviRichieste, eq(preventiviRichieste.id, preventiviRisposte.richiestaId))
      .innerJoin(tragitti, eq(tragitti.id, preventiviRichieste.tragittoId))
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(
        eq(preventiviRichieste.scopo, 'QUOTAZIONE'),
        isNull(tragitti.fornitoreId), isNull(tragitti.preventivoCosto), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl),
        isNull(eventi.eliminatoIl), eq(eventi.bozza, false), gte(eventi.data, inizioOggiRoma()),
      ));
    return righe.length;
  },
  /** Il percorso è cambiato dalla quotazione scelta? Per il riquadro viola
   *  in Quotazione e in Da confermare: fermate tolte e aggiunte, cosa fare e
   *  i km (solo se salvati con lo stesso calcolo, cioè da quando il percorso
   *  della quotazione ha una data). null se il percorso è lo stesso. */
  percorso: async (tragittoId: string) => {
    const [t] = await db.select({ kmAccettati: tragitti.kmAccettati, percorsoPreventivoIl: tragitti.percorsoPreventivoIl })
      .from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!t) throw new NonTrovato('Tragitto');
    const cambio = (await cambiPercorso([tragittoId])).get(tragittoId);
    if (!cambio) return null;
    const kmConfrontabili = t.percorsoPreventivoIl != null && t.kmAccettati != null;
    return {
      ...cambio,
      kmPreventivo: kmConfrontabili ? t.kmAccettati : null,
      kmOra: kmConfrontabili ? await calcolaKmApprossimati(tragittoId) : null,
    };
  },
  /** "La quotazione va ancora bene": il percorso di adesso diventa quello
   *  della quotazione, senza cambiare costo né scrivere a nessuno. Le
   *  richieste per cambio percorso ancora aperte si chiudono. */
  confermaPercorso: async (tragittoId: string) => {
    const [t] = await db.select({ preventivoCosto: tragitti.preventivoCosto }).from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!t) throw new NonTrovato('Tragitto');
    if (t.preventivoCosto == null) throw new ConflittoDati('Questo tragitto non ha ancora una quotazione da confermare.');
    await db.update(tragitti).set(await fotografiaPercorso(tragittoId)).where(eq(tragitti.id, tragittoId));
    return { ok: true as const };
  },
};

export const preventiviRouter = Router();

// ---------------------------------------------------------------------
// ROTTE PUBBLICHE — il fornitore risponde tramite il link ricevuto via
// email, nessun accesso da amministratore, nessuna password.
// ---------------------------------------------------------------------
preventiviRouter.get('/pubblico/:token', limitePnr, asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.getPubblico(req.params.token));
}));
preventiviRouter.post('/pubblico/:token/rispondi', limitePnr, valida(rispondiSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await preventiviService.rispondi(req.params.token, req.body));
}));

preventiviRouter.use(richiedeAuth);

const coordinateQuery = (req: Request) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ConflittoDati('Coordinate della partenza mancanti.');
  return { lat, lng };
};

preventiviRouter.get('/candidati/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng } = coordinateQuery(req);
  const raggioKm = req.query.raggioKm ? Number(req.query.raggioKm) : await leggiRaggioKmPreventivo();
  // Salvata qui, non solo in /richiedi — altrimenti il primo giro su un
  // tragitto calcola le coordinate solo per QUESTA lista (senza
  // persisterle), e /richiedi subito dopo le ritrova ancora vuote,
  // bloccandosi con "manca la posizione della partenza" anche se in
  // realtà era già stata appena geocodificata un attimo prima.
  await db.update(tragitti).set({ partenzaLat: lat, partenzaLng: lng }).where(eq(tragitti.id, req.params.tragittoId));
  res.json(await candidatiPerTragitto(req.params.tragittoId, lat, lng, raggioKm));
}));
preventiviRouter.post('/richiedi/:tragittoId', richiedePermesso('eventi.partenze'), valida(richiediSchema), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.richiedi(req.params.tragittoId, req.body));
}));
// Preventivi per il bus di una proposta da confermare.
preventiviRouter.get('/proposta/:lineaId/candidati', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng } = coordinateQuery(req);
  const raggioKm = req.query.raggioKm ? Number(req.query.raggioKm) : await leggiRaggioKmPreventivo();
  res.json(await candidatiPerBus(req.params.lineaId, lat, lng, raggioKm));
}));
preventiviRouter.post('/proposta/:lineaId/richiedi', richiedePermesso('eventi.partenze'), valida(richiediBusSchema), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.richiediBus(req.params.lineaId, req.body));
}));
preventiviRouter.get('/proposta/:lineaId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.listaPerProposta(req.params.lineaId));
}));
preventiviRouter.post('/richieste/:richiestaId/reinvia', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.reinviaRichiesta(req.params.richiestaId));
}));
preventiviRouter.get('/tragitto/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.listaPerTragitto(req.params.tragittoId));
}));
// Percorso cambiato dopo la quotazione scelta (null = in regola).
preventiviRouter.get('/percorso/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.percorso(req.params.tragittoId));
}));
// "La quotazione va ancora bene": stesso permesso di chi sceglie i preventivi.
preventiviRouter.post('/tragitto/:tragittoId/percorso-ok', richiedePermesso('preventivi.accetta'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.confermaPercorso(req.params.tragittoId));
}));
preventiviRouter.put('/risposte/:id/accetta', richiedePermesso('preventivi.accetta'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.accetta(req.params.id));
}));
preventiviRouter.get('/risposte/:id/file', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.fileRisposta(req.params.id, req.query.quale === 'firmato' ? 'firmato' : 'originale'));
}));
preventiviRouter.post('/risposte/:id/file-firmato', richiedePermesso('eventi.partenze'), valida(z.object({ fileNome: z.string().max(200), fileContenuto: fileBase64Schema })), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.caricaFileFirmato(req.params.id, req.body.fileNome, req.body.fileContenuto));
}));
preventiviRouter.post('/risposte/:id/reinvia-firmato', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.reinviaFileFirmato(req.params.id));
}));
