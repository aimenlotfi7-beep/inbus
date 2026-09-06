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

export const impostazioniRouter = Router();
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
