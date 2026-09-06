import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { preventiviRichieste, preventiviRisposte, fornitori, tragitti, eventi, fermate } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';
import { leggiRaggioKmPreventivo } from '../impostazioni/impostazioni.routes.js';
import { distanzaKm, calcolaKmApprossimati } from '../../shared/distanza.js';

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

const rispondiSchema = z.object({
  prezzo: z.number().positive(),
  fileNome: z.string().optional(),
  fileContenuto: z.string().optional(), // base64
});

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

  return nelRaggio.map((f) => {
    const distanza = Math.round(distanzaKm(lat, lng, f.lat!, f.lng!));
    if (f.id === tragitto.fornitoreId) return { ...f, distanzaKm: distanza, statoCandidato: 'accettato_in_precedenza' as const };
    if (contattatiIds.has(f.id)) return { ...f, distanzaKm: distanza, statoCandidato: 'gia_contattato' as const };
    if (f.invioAutomatico) return { ...f, distanzaKm: distanza, statoCandidato: 'automatico' as const };
    return { ...f, distanzaKm: distanza, statoCandidato: 'manuale' as const };
  }).sort((a, b) => a.distanzaKm - b.distanzaKm);
}

async function inviaRichiestaSingola(tragittoId: string, fornitore: typeof fornitori.$inferSelect, tipoInvio: 'AUTOMATICO' | 'MANUALE') {
  const { tragitto, evento } = await tragittoConEvento(tragittoId);
  const token = generaToken();
  await db.insert(preventiviRichieste).values({ tragittoId, fornitoreId: fornitore.id, token, tipoInvio });
  if (!fornitore.email) return; // fornitore senza email: registrato ma non contattabile, resta in lista come tentativo fallito silenzioso
  const link = urlSito(`/fornitore/preventivo/${token}`);
  await inviaEmail({
    a: fornitore.email,
    oggetto: `Richiesta preventivo — ${evento?.artista ?? 'evento'} (${tragitto.nome})`,
    html: `<p>Buongiorno,</p><p>Le chiediamo un preventivo per il seguente tragitto: <b>${tragitto.nome}</b>, evento <b>${evento?.artista ?? ''}</b> del ${evento?.data ? new Date(evento.data).toLocaleDateString('it-IT') : ''}.</p><p><a href="${link}">Apri la richiesta e rispondi</a></p><p>Il link mostra tutti i dettagli (fermate, orari) e permette di caricare il proprio preventivo.</p>`,
  });
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

    const daInviareAuto = candidati.filter((c) => c.statoCandidato === 'automatico');
    const daInviareManuale = candidati.filter((c) => input.fornitoriManualiIds.includes(c.id) && (c.statoCandidato === 'manuale' || c.statoCandidato === 'accettato_in_precedenza'));

    for (const f of daInviareAuto) await inviaRichiestaSingola(tragittoId, f, 'AUTOMATICO');
    for (const f of daInviareManuale) await inviaRichiestaSingola(tragittoId, f, 'MANUALE');

    return { inviateAutomatiche: daInviareAuto.length, inviateManuali: daInviareManuale.length };
  },
  listaPerTragitto: async (tragittoId: string) => {
    const richieste = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, tragittoId));
    const risultato = [];
    for (const r of richieste) {
      const [fornitore] = await db.select().from(fornitori).where(eq(fornitori.id, r.fornitoreId)).limit(1);
      const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, r.id)).limit(1);
      risultato.push({ richiesta: r, fornitore, risposta: risposta ?? null });
    }
    return risultato;
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
      risposta: risposta ? { prezzo: risposta.prezzo, fileNome: risposta.fileNome } : null,
    };
  },
  rispondi: async (token: string, input: z.infer<typeof rispondiSchema>) => {
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.token, token)).limit(1);
    if (!richiesta) throw new NonTrovato('Richiesta preventivo');
    const [esistente] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.richiestaId, richiesta.id)).limit(1);
    if (esistente) throw new ConflittoDati('Hai già inviato una risposta per questa richiesta — per modificarla, contatta direttamente chi ti ha scritto.');
    const [nuova] = await db.insert(preventiviRisposte).values({
      richiestaId: richiesta.id,
      prezzo: input.prezzo.toFixed(2),
      fileNome: input.fileNome,
      fileContenuto: input.fileContenuto,
    }).returning();
    return nuova;
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
    return { ok: true };
  },
  caricaFileFirmato: async (rispostaId: string, fileNome: string, fileContenuto: string) => {
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
    if (!risposta) throw new NonTrovato('Risposta preventivo');
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, risposta.richiestaId)).limit(1);
    const [fornitore] = richiesta ? await db.select().from(fornitori).where(eq(fornitori.id, richiesta.fornitoreId)).limit(1) : [];
    await db.update(preventiviRisposte).set({ fileFirmatoNome: fileNome, fileFirmatoContenuto: fileContenuto, fileFirmatoInviatoIl: new Date() }).where(eq(preventiviRisposte.id, rispostaId));
    if (fornitore?.email) {
      await inviaEmail({
        a: fornitore.email,
        oggetto: 'Preventivo confermato e firmato',
        html: '<p>In allegato trova il preventivo confermato, firmato per accettazione.</p>',
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
    const tragittiSenzaAccettazione = await db.select({ id: tragitti.id }).from(tragitti).where(and(inArray(tragitti.id, tragittiIds), isNull(tragitti.fornitoreId)));
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
};

export const preventiviRouter = Router();

// ---------------------------------------------------------------------
// ROTTE PUBBLICHE — il fornitore risponde tramite il link ricevuto via
// email, nessun accesso da amministratore, nessuna password.
// ---------------------------------------------------------------------
preventiviRouter.get('/pubblico/:token', asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.getPubblico(req.params.token));
}));
preventiviRouter.post('/pubblico/:token/rispondi', valida(rispondiSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await preventiviService.rispondi(req.params.token, req.body));
}));

preventiviRouter.use(richiedeAuth);

preventiviRouter.get('/candidati/:tragittoId', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const raggioKm = req.query.raggioKm ? Number(req.query.raggioKm) : await leggiRaggioKmPreventivo();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ConflittoDati('Coordinate della partenza mancanti.');
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
preventiviRouter.put('/risposte/:id/accetta', richiedePermesso('eventi.partenze'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.accetta(req.params.id));
}));
preventiviRouter.post('/risposte/:id/file-firmato', richiedePermesso('eventi.partenze'), valida(z.object({ fileNome: z.string(), fileContenuto: z.string() })), asyncHandler(async (req: Request, res: Response) => {
  res.json(await preventiviService.caricaFileFirmato(req.params.id, req.body.fileNome, req.body.fileContenuto));
}));
