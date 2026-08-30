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
const DEFAULT_SOGLIA_POSTICIPO_MINUTI = 20;

export async function leggiSogliaPosticipoMinuti(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_SOGLIA_POSTICIPO_MINUTI)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore >= 0 ? valore : DEFAULT_SOGLIA_POSTICIPO_MINUTI;
}

/** Sotto quanti partecipanti una fermata di "Partenza" non conviene
 *  includerla in una Linea — usata quando la fermata stessa non ha una
 *  soglia specifica impostata (fermate.sogliaMinima è null). */
export const CHIAVE_SOGLIA_MINIMA_PARTENZA = 'soglia_minima_fermata_partenza';
const DEFAULT_SOGLIA_MINIMA_PARTENZA = 10;

export async function leggiSogliaMinimaPartenza(): Promise<number> {
  const [riga] = await db.select().from(impostazioni).where(eq(impostazioni.chiave, CHIAVE_SOGLIA_MINIMA_PARTENZA)).limit(1);
  const valore = riga ? Number(riga.valore) : NaN;
  return Number.isFinite(valore) && valore >= 0 ? valore : DEFAULT_SOGLIA_MINIMA_PARTENZA;
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
