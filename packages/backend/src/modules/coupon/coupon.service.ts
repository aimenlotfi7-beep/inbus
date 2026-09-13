import { eq, and, or, isNull, gt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupon, promoter, utenti } from '../../db/schema.js';
import { NonTrovato, ErroreApplicativo, ConflittoDati } from '../../shared/errors.js';
import { inviaEmail } from '../../shared/email.service.js';
import { fineGiornoRoma, formattaData, formattaEuro, inizioGiornoRoma } from '../../shared/formato.js';
import type { CreaCouponInput, aggiornaCouponSchema } from './coupon.dto.js';
import type { z } from 'zod';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getById(id: string) {
  const [c] = await db.select().from(coupon).where(eq(coupon.id, id)).limit(1);
  if (!c) throw new NonTrovato('Coupon');
  return c;
}

/** Lo sconto di un coupon su un importo: percentuale, oppure l'importo
 *  fisso senza mai superare l'importo. */
export function scontoCoupon(c: { tipo: 'PERCENTUALE' | 'FISSO'; valore: string }, importo: number): number {
  return c.tipo === 'PERCENTUALE' ? importo * (Number(c.valore) / 100) : Math.min(Number(c.valore), importo);
}

/** Il coupon con questo codice se oggi è usabile da questo cliente: attivo,
 *  nelle date (giorni interi, ora di Roma: "valido fino al 30/09" vale fino
 *  a fine giornata) e, se è un voucher personale, dell'email giusta. */
async function leggiCouponValido(lettore: Pick<typeof db, 'select'>, codice: string, emailCliente?: string) {
  const [c] = await lettore.select().from(coupon).where(eq(coupon.codice, codice.toUpperCase())).limit(1);
  if (!c || !c.attivo) throw new ErroreApplicativo('Coupon non valido', 400, 'COUPON_NON_VALIDO');
  const oggi = new Date();
  if (c.validoDal && oggi < inizioGiornoRoma(c.validoDal)) throw new ErroreApplicativo('Coupon non ancora attivo', 400, 'COUPON_NON_VALIDO');
  if (c.validoAl && oggi >= fineGiornoRoma(c.validoAl)) throw new ErroreApplicativo('Coupon scaduto', 400, 'COUPON_NON_VALIDO');
  if (c.utenteId) {
    const [proprietario] = await lettore.select({ email: utenti.email }).from(utenti).where(eq(utenti.id, c.utenteId)).limit(1);
    if (!proprietario || proprietario.email.toLowerCase() !== emailCliente?.toLowerCase()) {
      throw new ErroreApplicativo('Questo voucher è personale, non è associato a questa email', 400, 'COUPON_NON_VALIDO');
    }
  }
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
      promoterId: input.promoterId ?? null,
      compensoTipo: input.compensoTipo ?? null,
      compensoValore: input.compensoValore != null ? input.compensoValore.toFixed(2) : null,
      compensoFissoPer: input.compensoFissoPer ?? null,
      utenteId: input.utenteId ?? null,
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
      ...(input.promoterId !== undefined && { promoterId: input.promoterId }),
      ...(input.compensoTipo !== undefined && { compensoTipo: input.compensoTipo }),
      ...(input.compensoValore !== undefined && { compensoValore: input.compensoValore != null ? input.compensoValore.toFixed(2) : null }),
      ...(input.compensoFissoPer !== undefined && { compensoFissoPer: input.compensoFissoPer }),
      ...(input.utenteId !== undefined && { utenteId: input.utenteId }),
    }).where(eq(coupon.id, id)).returning();
    return aggiornato;
  },

  async remove(id: string) {
    await getById(id);
    await db.delete(coupon).where(eq(coupon.id, id));
  },

  /** Anteprima pubblica (checkout, carrello, saldo): stesse regole
   *  dell'acquisto, senza contare l'uso. `importo` è quello delle righe su
   *  cui il coupon vale. */
  async valida(codice: string, importo: number, eventoId?: string, emailCliente?: string) {
    const c = await leggiCouponValido(db, codice, emailCliente);
    if (c.usiMax !== null && c.usiAttuali >= c.usiMax) throw new ErroreApplicativo('Coupon esaurito', 400, 'COUPON_NON_VALIDO');
    if (c.eventoId && eventoId && c.eventoId !== eventoId) throw new ErroreApplicativo('Questo coupon non è valido per questo evento', 400, 'COUPON_NON_VALIDO');
    return { sconto: scontoCoupon(c, importo), coupon: c };
  },

  /** Al momento del vero acquisto (dentro la transazione): stessi
   *  controlli di valida() e UN uso contato, in un solo comando atomico
   *  (UPDATE...WHERE...RETURNING) — due richieste sull'ultimo uso
   *  disponibile non passano entrambe. Si chiama una volta per ordine o
   *  per saldo: l'evento lo controlla chi applica lo sconto alle righe. */
  async verificaEIncrementaUtilizzo(tx: Tx, codice: string, emailCliente?: string) {
    const c = await leggiCouponValido(tx, codice, emailCliente);
    const [aggiornato] = await tx.update(coupon)
      .set({ usiAttuali: sql`${coupon.usiAttuali} + 1` })
      .where(and(
        eq(coupon.id, c.id),
        or(isNull(coupon.usiMax), gt(coupon.usiMax, coupon.usiAttuali)),
      ))
      .returning();
    if (!aggiornato) throw new ErroreApplicativo('Coupon esaurito', 400, 'COUPON_NON_VALIDO');
    return aggiornato;
  },

  /** Il codice del promoter collegato a questo coupon, se c'è — per
   *  attribuire la vendita insieme allo sconto (vedi verificaEIncrementaUtilizzo). */
  async promoterDiCoupon(tx: Tx, promoterId: string | null | undefined): Promise<string | undefined> {
    if (!promoterId) return undefined;
    const [p] = await tx.select({ codice: promoter.codice }).from(promoter).where(eq(promoter.id, promoterId)).limit(1);
    return p?.codice;
  },

  /** Manda il voucher via email al cliente a cui è assegnato — deve
   *  averne uno (utenteId impostato), altrimenti non si sa a chi
   *  mandarla. Usata dal pulsante "Invia via email" in Voucher. */
  async inviaViaEmail(id: string) {
    const c = await getById(id);
    if (!c.utenteId) throw new ErroreApplicativo('Questo codice non è assegnato a nessun cliente — assegnalo prima di inviarlo.', 400, 'VOUCHER_SENZA_CLIENTE');
    const [u] = await db.select({ email: utenti.email, nome: utenti.nome }).from(utenti).where(eq(utenti.id, c.utenteId)).limit(1);
    if (!u) throw new NonTrovato('Cliente');

    // Testo modificabile dal gestionale ("Testo email"), come le altre email.
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('voucher', {
      nome: u.nome ?? '',
      codice: c.codice,
      sconto: c.tipo === 'PERCENTUALE' ? `${Number(c.valore)}%` : formattaEuro(c.valore),
      scadenza: c.validoAl ? `Valido fino al ${formattaData(c.validoAl)}.` : 'Nessuna scadenza.',
    });
    const { inviata } = await inviaEmail({ a: u.email, oggetto, html });
    if (inviata) await db.update(coupon).set({ inviatoIl: new Date() }).where(eq(coupon.id, id));
    return { inviata, email: u.email };
  },
};
