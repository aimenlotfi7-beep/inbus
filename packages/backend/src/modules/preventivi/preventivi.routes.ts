import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { eq, and, inArray, isNull, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { preventiviRichieste, preventiviRisposte, fornitori, tragitti, eventi, fermate } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';
import { templateEmailService } from '../template-email/template-email.service.js';
import { leggiRaggioKmPreventivo, leggiNotificaNonScelti, leggiGiorniValiditaLinkPreventivo } from '../impostazioni/impostazioni.routes.js';
import { limitePnr } from '../../shared/rateLimit.js';
import { distanzaKm, calcolaKmApprossimati } from '../../shared/distanza.js';
import { classificaCandidato, destinatariRichiesta } from './classifica-candidato.js';

function generaToken() {
  return crypto.randomBytes(24).toString('hex');
}

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
});

// Limite per singolo allegato, lato server (il cap globale di Express a
// 15MB protegge il processo, non la tabella): un PDF di preventivo sta
// in pochi MB, oltre è quasi certamente un errore o un abuso. In base64
// 8MB di file diventano ~10.7M caratteri.
const MAX_FILE_BASE64 = 8 * 1024 * 1024 * 4 / 3;
const fileBase64Schema = z.string().max(MAX_FILE_BASE64, 'Il file supera gli 8MB consentiti.');

const rispondiSchema = z.object({
  prezzo: z.number().positive(),
  fileNome: z.string().max(200).optional(),
  fileContenuto: fileBase64Schema.optional(), // base64
});

/** Le email sono un effetto collaterale, non la sostanza dell'azione:
 *  se una fallisce (indirizzo sbagliato, provider giù, quota finita)
 *  l'azione — che sul database è già avvenuta — deve rispondere "ok"
 *  lo stesso, non 500 con uno stato a metà. Qui si registra e si va
 *  avanti; torna false per lasciare al chiamante la scelta di contarlo. */
async function inviaEmailBestEffort(...args: Parameters<typeof inviaEmail>): Promise<boolean> {
  try {
    await inviaEmail(...args);
    return true;
  } catch (e) {
    console.error(`[preventivi] invio email a ${args[0].a} fallito:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Il link è scaduto se la richiesta è più vecchia dei giorni impostati
 *  E non ha ancora una risposta (chi ha risposto rivede sempre la sua). */
async function linkScaduto(richiesta: { creataIl: Date }, giaRisposto: boolean): Promise<boolean> {
  if (giaRisposto) return false;
  const giorni = await leggiGiorniValiditaLinkPreventivo();
  return Date.now() - new Date(richiesta.creataIl).getTime() > giorni * 24 * 60 * 60 * 1000;
}

async function tragittoConEvento(tragittoId: string) {
  const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
  if (!t) throw new NonTrovato('Tragitto');
  const [e] = await db.select().from(eventi).where(eq(eventi.id, t.eventoId)).limit(1);
  return { tragitto: t, evento: e };
}

/** Ogni fornitore APPROVATO nel raggio, con lo stato che determina
 *  come compare nella lista di scelta manuale — vedi conversazione per
 *  la logica completa (chi è "già contattato" resta visibile ma
 *  disattivato, chi è stato accettato in precedenza rientra
 *  normalmente). */
async function candidatiPerTragitto(tragittoId: string, lat: number, lng: number, raggioKm: number) {
  const { tragitto } = await tragittoConEvento(tragittoId);
  const tutti = await db.select().from(fornitori).where(eq(fornitori.stato, 'APPROVATO'));
  const nelRaggio = tutti.filter((f) => f.lat != null && f.lng != null && distanzaKm(lat, lng, f.lat, f.lng) <= raggioKm);

  const giaContattati = await db.select({ fornitoreId: preventiviRichieste.fornitoreId }).from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, tragittoId));
  const contattatiIds = new Set(giaContattati.map((r) => r.fornitoreId));

  return nelRaggio.map((f) => ({
    ...f,
    distanzaKm: Math.round(distanzaKm(lat, lng, f.lat!, f.lng!)),
    statoCandidato: classificaCandidato(f, { fornitoreAccettatoId: tragitto.fornitoreId, contattatiIds }),
  })).sort((a, b) => a.distanzaKm - b.distanzaKm);
}

async function inviaRichiestaSingola(tragittoId: string, fornitore: typeof fornitori.$inferSelect, tipoInvio: 'AUTOMATICO' | 'MANUALE') {
  const { tragitto, evento } = await tragittoConEvento(tragittoId);
  const token = generaToken();
  await db.insert(preventiviRichieste).values({ tragittoId, fornitoreId: fornitore.id, token, tipoInvio });
  if (!fornitore.email) return; // fornitore senza email: registrato ma non contattabile, resta in lista come tentativo fallito silenzioso
  const link = urlSito(`/fornitore/preventivo/${token}`);
  const { oggetto, html } = await templateEmailService.renderizza('preventivo_richiesta', {
    evento: evento?.artista ?? 'evento',
    tragitto: tragitto.nome,
    data: evento?.data ? new Date(evento.data).toLocaleDateString('it-IT') : '',
    link,
  });
  await inviaEmailBestEffort({ a: fornitore.email, oggetto, html });
}

export const preventiviService = {
  candidatiPerTragitto,
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

    const { automatici: daInviareAuto, manuali: daInviareManuale } = destinatariRichiesta(candidati, new Set(input.fornitoriManualiIds));

    for (const f of daInviareAuto) await inviaRichiestaSingola(tragittoId, f, 'AUTOMATICO');
    for (const f of daInviareManuale) await inviaRichiestaSingola(tragittoId, f, 'MANUALE');

    return { inviateAutomatiche: daInviareAuto.length, inviateManuali: daInviareManuale.length };
  },
  // Tre query in tutto (non una per riga), e delle risposte SOLO i
  // metadati: gli allegati (base64, anche MB l'uno) si scaricano a
  // parte con /risposte/:id/file quando servono — prima ogni apertura
  // della tab Preventivi scaricava tutti i PDF di tutti i fornitori
  // solo per mostrare nome e prezzo in tabella.
  listaPerTragitto: async (tragittoId: string) => {
    const richieste = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, tragittoId));
    if (richieste.length === 0) return [];
    const fornitoriRighe = await db.select().from(fornitori).where(inArray(fornitori.id, [...new Set(richieste.map((r) => r.fornitoreId))]));
    const risposte = await db.select({
      id: preventiviRisposte.id, richiestaId: preventiviRisposte.richiestaId, prezzo: preventiviRisposte.prezzo,
      fileNome: preventiviRisposte.fileNome, fileFirmatoNome: preventiviRisposte.fileFirmatoNome,
      fileFirmatoInviatoIl: preventiviRisposte.fileFirmatoInviatoIl, inviataIl: preventiviRisposte.inviataIl,
      haFile: sql<boolean>`${preventiviRisposte.fileContenuto} IS NOT NULL`,
      haFileFirmato: sql<boolean>`${preventiviRisposte.fileFirmatoContenuto} IS NOT NULL`,
    }).from(preventiviRisposte).where(inArray(preventiviRisposte.richiestaId, richieste.map((r) => r.id)));
    const fornitorePerId = new Map(fornitoriRighe.map((f) => [f.id, f]));
    const rispostaPerRichiesta = new Map(risposte.map((r) => [r.richiestaId, r]));
    return richieste.map((r) => ({ richiesta: r, fornitore: fornitorePerId.get(r.fornitoreId), risposta: rispostaPerRichiesta.get(r.id) ?? null }));
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
    const fermateTragitto = await db.select().from(fermate).where(eq(fermate.tragittoId, richiesta.tragittoId));
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, richiesta.id)).limit(1);
    return {
      tragitto: { nome: tragitto.nome, arrivoCitta: tragitto.arrivoCitta, arrivoOrario: tragitto.arrivoOrario },
      evento: evento ? { artista: evento.artista, data: evento.data, luogo: evento.luogo, citta: evento.citta } : null,
      fermate: fermateTragitto.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario })),
      // Definitiva una volta inviata — se già risposto, il form
      // pubblico mostra sola lettura invece dei campi da compilare.
      giaRisposto: !!risposta,
      scaduto: await linkScaduto(richiesta, !!risposta),
      risposta: risposta ? { prezzo: risposta.prezzo, fileNome: risposta.fileNome } : null,
    };
  },
  rispondi: async (token: string, input: z.infer<typeof rispondiSchema>) => {
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.token, token)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    const [esistente] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, richiesta.id)).limit(1);
    if (esistente) throw new ConflittoDati('Hai già inviato una risposta per questa richiesta — per modificarla, contatta direttamente chi ti ha scritto.');
    if (await linkScaduto(richiesta, false)) throw new ConflittoDati('Questo link è scaduto — se vuole ancora inviare un preventivo, contatti direttamente chi le ha scritto.');
    try {
      const [nuova] = await db.insert(preventiviRisposte).values({
        richiestaId: richiesta.id,
        prezzo: input.prezzo.toFixed(2),
        fileNome: input.fileNome,
        fileContenuto: input.fileContenuto,
      }).returning();
      return { id: nuova.id, prezzo: nuova.prezzo, fileNome: nuova.fileNome };
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
  accetta: async (rispostaId: string) => {
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!risposta) throw new NonTrovato('Risposta preventivo');
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, risposta.richiestaId)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    // Scrive esattamente negli stessi campi già usati per l'inserimento
    // a mano in Prezzi — un preventivo accettato non è concettualmente
    // diverso da uno scritto a mano con fornitore indicato.
    const kmAccettati = await calcolaKmApprossimati(richiesta.tragittoId);
    await db.update(tragitti).set({ preventivoCosto: risposta.prezzo, fornitoreId: richiesta.fornitoreId, ...(kmAccettati != null && { kmAccettati }) }).where(eq(tragitti.id, richiesta.tragittoId));

    // Avviso agli altri fornitori che avevano risposto per lo stesso
    // tragitto (non a chi non ha ancora risposto — non ha senso
    // avvisare chi non sapeva nemmeno se sarebbe stato considerato) —
    // impostazione fissa, non a ogni accettazione, come deciso.
    if (await leggiNotificaNonScelti()) {
      const altreRichieste = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, richiesta.tragittoId));
      for (const altra of altreRichieste) {
        if (altra.id === richiesta.id) continue;
        const [altraRisposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, altra.id)).limit(1);
        if (!altraRisposta) continue; // non aveva risposto — niente da avvisare
        const [altroFornitore] = await db.select().from(fornitori).where(eq(fornitori.id, altra.fornitoreId)).limit(1);
        if (!altroFornitore?.email) continue;
        const { oggetto, html } = await templateEmailService.renderizza('preventivo_non_scelto', {});
        await inviaEmailBestEffort({ a: altroFornitore.email, oggetto, html });
      }
    }
    return { ok: true };
  },
  caricaFileFirmato: async (rispostaId: string, fileNome: string, fileContenuto: string) => {
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!risposta) throw new NonTrovato('Risposta preventivo');
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, risposta.richiestaId)).limit(1);
    const [fornitore] = richiesta ? await db.select().from(fornitori).where(eq(fornitori.id, richiesta.fornitoreId)).limit(1) : [];
    await db.update(preventiviRisposte).set({ fileFirmatoNome: fileNome, fileFirmatoContenuto: fileContenuto, fileFirmatoInviatoIl: new Date() }).where(eq(preventiviRisposte.id, rispostaId));
    if (fornitore?.email) {
      const { oggetto, html } = await templateEmailService.renderizza('preventivo_firmato', {});
      await inviaEmailBestEffort({
        a: fornitore.email,
        oggetto, html,
        allegati: [{ nomeFile: fileNome, contenuto: Buffer.from(fileContenuto, 'base64'), tipo: 'application/pdf' }],
      });
    }
    return { ok: true };
  },
  // Per il badge nel menu — una risposta "da valutare" è una risposta
  // arrivata per un tragitto che NON ha ancora un fornitore accettato
  // (una volta accettato uno, tutte le altre risposte per quel
  // tragitto restano solo storico, non più "da decidere").
  contaDaValutare: async () => {
    const risposte = await db.select({ tragittoId: preventiviRichieste.tragittoId }).from(preventiviRisposte)
      .innerJoin(preventiviRichieste, eq(preventiviRichieste.id, preventiviRisposte.richiestaId));
    const tragittiIds = [...new Set(risposte.map((r) => r.tragittoId))];
    if (tragittiIds.length === 0) return 0;
    const tragittiSenzaAccettazione = await db.select({ id: tragitti.id }).from(tragitti).where(and(inArray(tragitti.id, tragittiIds), isNull(tragitti.fornitoreId), isNull(tragitti.eliminatoIl)));
    return tragittiSenzaAccettazione.length;
  },
  // Per il banner in Linee — confronta i km salvati al momento
  // dell'accettazione con quelli ricalcolati ORA sulle fermate attive.
  // "Cambiato parecchio" = oltre il 15% di differenza, soglia semplice
  // per non segnalare ogni minima imprecisione della geocodifica.
  verificaKm: async (tragittoId: string) => {
    const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!t) throw new NonTrovato('Tragitto');
    if (t.kmAccettati == null) return { kmAccettati: null, kmAttuali: null, cambiatoParecchio: false };
    const kmAttuali = await calcolaKmApprossimati(tragittoId);
    if (kmAttuali == null) return { kmAccettati: t.kmAccettati, kmAttuali: null, cambiatoParecchio: false };
    const differenza = Math.abs(kmAttuali - t.kmAccettati) / t.kmAccettati;
    return { kmAccettati: t.kmAccettati, kmAttuali, cambiatoParecchio: differenza > 0.15 };
  },
  // Per ogni fornitore: quante richieste ha ricevuto, quante ha
  // risposto, quante volte è stato scelto (accettato), prezzo medio di
  // quelle accettate. dataDa facoltativo — filtra per quando è stata
  // fatta la richiesta (creataIl), non quando è stata accettata (non
  // teniamo quella data a parte, l'accettazione aggiorna solo il
  // tragitto).
  statistichePerFornitore: async (dataDa?: Date) => {
    // Quattro query in tutto invece di quattro PER fornitore.
    const richieste = await db.select().from(preventiviRichieste).where(dataDa ? gte(preventiviRichieste.creataIl, dataDa) : undefined);
    if (richieste.length === 0) return [];
    const fornitoriIds = [...new Set(richieste.map((r) => r.fornitoreId))];
    const [tuttiFornitori, risposte, tragittiCoinvolti] = await Promise.all([
      db.select().from(fornitori).where(inArray(fornitori.id, fornitoriIds)),
      db.select({ richiestaId: preventiviRisposte.richiestaId }).from(preventiviRisposte).where(inArray(preventiviRisposte.richiestaId, richieste.map((r) => r.id))),
      db.select({ id: tragitti.id, fornitoreId: tragitti.fornitoreId, preventivoCosto: tragitti.preventivoCosto }).from(tragitti).where(inArray(tragitti.id, [...new Set(richieste.map((r) => r.tragittoId))])),
    ]);
    const richiesteConRisposta = new Set(risposte.map((r) => r.richiestaId));
    const tragittoPerId = new Map(tragittiCoinvolti.map((t) => [t.id, t]));
    const risultato = tuttiFornitori.map((f) => {
      const sue = richieste.filter((r) => r.fornitoreId === f.id);
      // "Scelto" = tra i tragitti per cui è stato contattato, quelli che
      // oggi hanno LUI come fornitore accettato (un tragitto contato una
      // volta sola anche se contattato più volte).
      const tragittiVinti = [...new Set(sue.map((r) => r.tragittoId))].map((id) => tragittoPerId.get(id)).filter((t) => t && t.fornitoreId === f.id);
      const prezziAccettati = tragittiVinti.filter((t) => t!.preventivoCosto).map((t) => Number(t!.preventivoCosto));
      return {
        fornitore: f,
        richiesteRicevute: sue.length,
        risposteDate: sue.filter((r) => richiesteConRisposta.has(r.id)).length,
        volteScelto: tragittiVinti.length,
        prezzoMedio: prezziAccettati.length ? prezziAccettati.reduce((a, b) => a + b, 0) / prezziAccettati.length : null,
      };
    });
    return risultato.sort((a, b) => b.volteScelto - a.volteScelto);
  },
  // Storico prezzi per coppia partenza→arrivo (solo tragitti con un
  // preventivo accettato) — €/km oltre al prezzo totale, per
  // confrontare tratte con un numero diverso di fermate (vedi
  // conversazione). dataDa filtra sulla creazione del tragitto stesso
  // (non teniamo una data di accettazione a parte).
  storicoPerTratta: async (dataDa?: Date) => {
    const condizioniBase = [sql`${tragitti.preventivoCosto} IS NOT NULL`, sql`${tragitti.fornitoreId} IS NOT NULL`];
    if (dataDa) condizioniBase.push(gte(eventi.data, dataDa));
    const righe = await db.select({ tragitto: tragitti, evento: eventi }).from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId)).where(and(...condizioniBase));
    if (righe.length === 0) return [];
    // Una query per tutte le partenze, non una per tragitto.
    const partenze = await db.select({ tragittoId: fermate.tragittoId, citta: fermate.citta }).from(fermate)
      .where(and(inArray(fermate.tragittoId, righe.map((r) => r.tragitto.id)), eq(fermate.ordine, 0)));
    const partenzaPerTragitto = new Map(partenze.map((p) => [p.tragittoId, p]));
    const conPartenza = [];
    for (const r of righe) {
      const partenza = partenzaPerTragitto.get(r.tragitto.id);
      if (!partenza) continue;
      conPartenza.push({
        partenza: partenza.citta,
        arrivo: r.tragitto.arrivoCitta ?? '—',
        prezzo: Number(r.tragitto.preventivoCosto),
        km: r.tragitto.kmAccettati,
        data: r.evento.data,
        nomeTragitto: r.tragitto.nome,
        artista: r.evento.artista,
      });
    }
    return conPartenza.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
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

preventiviRouter.get('/candidati/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const raggioKm = req.query.raggioKm ? Number(req.query.raggioKm) : await leggiRaggioKmPreventivo();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ConflittoDati('Coordinate della partenza mancanti.');
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
preventiviRouter.get('/tragitto/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.listaPerTragitto(req.params.tragittoId));
}));
preventiviRouter.get('/conta-da-valutare', richiedePermesso('eventi.partenze'), asyncHandler(async (_req: Request, res: Response) => {
  res.json({ conteggio: await preventiviService.contaDaValutare() });
}));
preventiviRouter.get('/verifica-km/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.verificaKm(req.params.tragittoId));
}));
preventiviRouter.get('/statistiche/fornitori', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  const dataDa = req.query.dataDa ? new Date(req.query.dataDa as string) : undefined;
  res.json(await preventiviService.statistichePerFornitore(dataDa));
}));
preventiviRouter.get('/statistiche/tratte', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  const dataDa = req.query.dataDa ? new Date(req.query.dataDa as string) : undefined;
  res.json(await preventiviService.storicoPerTratta(dataDa));
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
