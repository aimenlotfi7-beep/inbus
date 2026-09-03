import { eq, and, or, isNull, gt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupon } from '../../db/schema.js';
import { NonTrovato, ErroreApplicativo, ConflittoDati } from '../../shared/errors.js';
import type { CreaCouponInput, aggiornaCouponSchema } from './coupon.dto.js';
import type { z } from 'zod';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getById(id: string) {
  const [c] = await db.select().from(coupon).where(eq(coupon.id, id)).limit(1);
  if (!c) throw new NonTrovato('Coupon');
  return c;
}

export const couponService = {
  list: () => db.select().from(coupon),
  getById,

  async create(input: CreaCouponInput) {
    const [nuovo] = await db.insert(coupon).values({
      codice: input.codice,
      tipo: input.tipo,
      valore: input.valore.toFixed(2),
      usiMax: input.usiMax,
      validoDal: input.validoDal,
      validoAl: input.validoAl,
      attivo: input.attivo,
      eventoId: input.eventoId ?? null,
    }).returning();
    return nuovo;
  },

  async update(id: string, input: z.infer<typeof aggiornaCouponSchema>) {
    await getById(id);
    const [aggiornato] = await db.update(coupon).set({
      ...(input.codice !== undefined && { codice: input.codice }),
      ...(input.tipo !== undefined && { tipo: input.tipo }),
      ...(input.valore !== undefined && { valore: input.valore.toFixed(2) }),
      ...(input.usiMax !== undefined && { usiMax: input.usiMax }),
      ...(input.validoDal !== undefined && { validoDal: input.validoDal }),
      ...(input.validoAl !== undefined && { validoAl: input.validoAl }),
      ...(input.attivo !== undefined && { attivo: input.attivo }),
      ...(input.eventoId !== undefined && { eventoId: input.eventoId }),
    }).where(eq(coupon.id, id)).returning();
    return aggiornato;
  },

  async remove(id: string) {
    await getById(id);
    await db.delete(coupon).where(eq(coupon.id, id));
  },

  /** Logica di validazione condivisa: usata qui per l'anteprima admin e
   *  da prenotazioni.service.ts al momento del vero acquisto. */
  async valida(codice: string, importo: number, eventoId?: string) {
    const [c] = await db.select().from(coupon).where(eq(coupon.codice, codice.toUpperCase())).limit(1);
    if (!c || !c.attivo) throw new ErroreApplicativo('Coupon non valido', 400, 'COUPON_NON_VALIDO');
    const oggi = new Date();
    if (c.validoDal && oggi < c.validoDal) throw new ErroreApplicativo('Coupon non ancora attivo', 400, 'COUPON_NON_VALIDO');
    if (c.validoAl && oggi > c.validoAl) throw new ErroreApplicativo('Coupon scaduto', 400, 'COUPON_NON_VALIDO');
    if (c.usiMax !== null && c.usiAttuali >= c.usiMax) throw new ErroreApplicativo('Coupon esaurito', 400, 'COUPON_NON_VALIDO');
    if (c.eventoId && eventoId && c.eventoId !== eventoId) throw new ErroreApplicativo('Questo coupon non è valido per questo evento', 400, 'COUPON_NON_VALIDO');

    const sconto = c.tipo === 'PERCENTUALE' ? importo * (Number(c.valore) / 100) : Math.min(Number(c.valore), importo);
    return { sconto, coupon: c };
  },

  /** Come valida() sopra (stesse regole), MA usata al momento del vero
   *  acquisto (dentro la transazione della prenotazione, "tx"
   *  obbligatoria) — controllo e incremento in UN solo comando atomico
   *  (UPDATE...WHERE...RETURNING), non due passaggi separati. Due
   *  richieste quasi simultanee sull'ultimo uso disponibile: solo una
   *  delle due riceve una riga da RETURNING, l'altra vede l'elenco
   *  vuoto e capisce che il coupon è stato appena esaurito da qualcun
   *  altro — impossibile che entrambe passino. */
  async verificaEIncrementaUtilizzo(tx: Tx, codice: string, importo: number, eventoId?: string) {
    const [c] = await tx.select().from(coupon).where(eq(coupon.codice, codice.toUpperCase())).limit(1);
    if (!c || !c.attivo) throw new ErroreApplicativo('Coupon non valido', 400, 'COUPON_NON_VALIDO');
    const oggi = new Date();
    if (c.validoDal && oggi < c.validoDal) throw new ErroreApplicativo('Coupon non ancora attivo', 400, 'COUPON_NON_VALIDO');
    if (c.validoAl && oggi > c.validoAl) throw new ErroreApplicativo('Coupon scaduto', 400, 'COUPON_NON_VALIDO');
    if (c.eventoId && eventoId && c.eventoId !== eventoId) throw new ErroreApplicativo('Questo coupon non è valido per questo evento', 400, 'COUPON_NON_VALIDO');

    const [aggiornato] = await tx.update(coupon)
      .set({ usiAttuali: sql`${coupon.usiAttuali} + 1` })
      .where(and(
        eq(coupon.id, c.id),
        or(isNull(coupon.usiMax), gt(coupon.usiMax, coupon.usiAttuali)),
      ))
      .returning();
    if (!aggiornato) throw new ConflittoDati('Questo coupon è appena stato esaurito — qualcun altro l\'ha usato un istante fa.');

    const sconto = c.tipo === 'PERCENTUALE' ? importo * (Number(c.valore) / 100) : Math.min(Number(c.valore), importo);
    return { sconto, coupon: aggiornato };
  },
};
