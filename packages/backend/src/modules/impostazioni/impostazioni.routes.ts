import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { impostazioni } from '../../db/schema.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

/** Chiave usata per la capienza di default di un bus, in "Calcola bus
 *  necessari" nella sezione Partenze. Modificabile dal gestionale. */
export const CHIAVE_POSTI_PER_BUS = 'posti_per_bus';
const DEFAULT_POSTI_PER_BUS = 50;

export async function leggiPostiPerBus(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_POSTI_PER_BUS)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore > 0 ? valore : DEFAULT_POSTI_PER_BUS;
}

/** Credito fedeltà maturato per ogni passeggero, dopo che il suo
 *  viaggio è davvero avvenuto — modificabile dal gestionale, senza
 *  bisogno di ripubblicare il codice per cambiare importo. */
export const CHIAVE_CREDITO_PER_PASSEGGERO = 'credito_per_passeggero';
const DEFAULT_CREDITO_PER_PASSEGGERO = 0.5;

export async function leggiCreditoPerPasseggero(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_CREDITO_PER_PASSEGGERO)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore >= 0 ? valore : DEFAULT_CREDITO_PER_PASSEGGERO;
}

/** Un posticipo dell'orario di una fermata sotto questa soglia non fa
 *  scattare la comunicazione ai clienti — troppi piccoli aggiustamenti
 *  manderebbero email inutili. L'anticipo (qualunque entità) e il
 *  cambio città/indirizzo restano SEMPRE notificati, senza soglia. */
export const CHIAVE_SOGLIA_POSTICIPO_MINUTI = 'soglia_posticipo_variazione_minuti';

// Nessun valore di riserva — se non impostata esplicitamente qui sotto
// (in Impostazioni), la soglia resta a 0: qualunque posticipo, anche
// di un minuto solo, notifica il cliente. Meglio avvisare in più che
// restare in silenzio per un numero mai confermato da chi gestisce il
// sito (stessa scelta già fatta per la soglia minima partecipanti).
export async function leggiSogliaPosticipoMinuti(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_SOGLIA_POSTICIPO_MINUTI)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore >= 0 ? valore : 0;
}

/** Raggio in km (linea d'aria) di default per cercare i fornitori
 *  vicini alla partenza di un tragitto, quando si richiede un
 *  preventivo — modificabile per singola richiesta, questo è solo il
 *  punto di partenza proposto. */
export const CHIAVE_RAGGIO_KM_PREVENTIVO = 'raggio_km_preventivo';
const DEFAULT_RAGGIO_KM_PREVENTIVO = 40;

export async function leggiRaggioKmPreventivo(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_RAGGIO_KM_PREVENTIVO)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore > 0 ? valore : DEFAULT_RAGGIO_KM_PREVENTIVO;
}

/** Se attivo, accettando un preventivo si avvisano via mail gli altri
 *  fornitori che avevano risposto per lo stesso tragitto — spiegando
 *  che è stato scelto un altro. Impostazione fissa (non a ogni
 *  accettazione), come deciso in conversazione. Default: attivo. */
export const CHIAVE_NOTIFICA_NON_SCELTI = 'notifica_fornitori_non_scelti';

export async function leggiNotificaNonScelti(): Promise<boolean> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_NOTIFICA_NON_SCELTI)).limit(1);
  return riga ? riga.valore === 'true' : true;
}

/** Giorni di validità del link inviato al fornitore: dopo, il link
 *  risponde "scaduto" (niente più risposte tardive su un evento ormai
 *  organizzato, e un token finito in una mail inoltrata non resta
 *  utilizzabile per sempre). Chi ha già risposto continua a vedere la
 *  propria risposta. Nessuna migrazione: si calcola da creataIl. */
export const CHIAVE_GIORNI_LINK_PREVENTIVO = 'giorni_validita_link_preventivo';
const DEFAULT_GIORNI_LINK_PREVENTIVO = 60;

export async function leggiGiorniValiditaLinkPreventivo(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_GIORNI_LINK_PREVENTIVO)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore > 0 ? valore : DEFAULT_GIORNI_LINK_PREVENTIVO;
}

/** ID pubblico del Pixel di Meta — NON è segreto, compare comunque nel
 *  codice sorgente di ogni pagina una volta caricato: leggibile anche
 *  senza login (endpoint pubblico più sotto), a differenza del token
 *  della Conversions API qui sotto. */
export const CHIAVE_META_PIXEL_ID = 'meta_pixel_id';
export async function leggiMetaPixelId(): Promise<string | null> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_META_PIXEL_ID)).limit(1);
  return riga?.valore || null;
}

/** Token della Conversions API — QUESTO sì è segreto: mai esposto in
 *  nessuna rotta pubblica, letto solo lato server per chiamare l'API
 *  di Meta (shared/metaConversions.ts). Si genera in Meta Events
 *  Manager → Impostazioni → Conversions API → Genera token di accesso. */
export const CHIAVE_META_CAPI_TOKEN = 'meta_capi_token';
export async function leggiMetaCapiToken(): Promise<string | null> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_META_CAPI_TOKEN)).limit(1);
  return riga?.valore || null;
}

/** ID di misurazione GA4 ("G-XXXXXXXXXX") — non è segreto, come il
 *  Pixel ID compare comunque nel codice sorgente di ogni pagina. */
export const CHIAVE_GA4_MEASUREMENT_ID = 'ga4_measurement_id';
export async function leggiGa4MeasurementId(): Promise<string | null> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_GA4_MEASUREMENT_ID)).limit(1);
  return riga?.valore || null;
}

export const impostazioniRouter = Router();

// Pubblica — PRIMA di richiedeAuth. Un'unica chiamata per tutti gli id
// di tracciamento (nessuno dei due è segreto) — il sito li legge
// insieme, un giro solo invece di due.
impostazioniRouter.get('/pubblico/tracciamento', asyncHandler(async (_req: Request, res: Response) => {
  const [pixelId, ga4Id] = await Promise.all([leggiMetaPixelId(), leggiGa4MeasurementId()]);
  res.json({ pixelId, ga4Id });
}));
// Vecchia rotta mantenuta per compatibilità (nessuna versione vecchia
// del frontend la chiama più dopo questo deploy, ma costa nulla
// lasciarla finché non si è sicuri).
impostazioniRouter.get('/pubblico/meta-pixel-id', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ pixelId: await leggiMetaPixelId() });
}));

impostazioniRouter.use(richiedeAuth);

impostazioniRouter.get('/', richiedePermesso('impostazioni.gestisci'), asyncHandler(async (_req: Request, res: Response) => {
  const tutte = await db.select().from(impostazioni);
  res.json(tutte);
}));

impostazioniRouter.put(
  '/:chiave',
  richiedePermesso('impostazioni.gestisci'),
  valida(z.object({ valore: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    await db.insert(impostazioni).values({ chiave: req.params.chiave, valore: req.body.valore })
      .onConflictDoUpdate({ target: impostazioni.chiave, set: { valore: req.body.valore } });
    res.json({ ok: true });
  })
);
