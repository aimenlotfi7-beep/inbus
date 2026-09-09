import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { coupon } from '../db/schema.js';
import { calcolaCommissioneRighe } from './commissioneRighe.js';

interface RigaPerCommissione {
  totale: number;
  passeggeri: number;
  couponCodice: string | null;
}

/** La commissione di un promoter NON è più sempre "fatturato totale ×
 *  un'unica percentuale" — da quando un coupon può avere un compenso
 *  proprio, serve calcolarla riga per riga. Usata sia dal report
 *  Campagne sia dalle statistiche del promoter stesso — stessa logica,
 *  un solo posto dove viverla. Recupera i coupon coinvolti (una query
 *  sola, non una per riga) poi delega la matematica vera a
 *  calcolaCommissioneRighe (shared/commissioneRighe.ts) — quella,
 *  senza nessun import di database, si può testare a fondo da sola. */
export async function calcolaCommissionePromoter(righe: RigaPerCommissione[], defaultPercentuale: number): Promise<number> {
  const codiciCoupon = [...new Set(righe.map((r) => r.couponCodice).filter((c): c is string => !!c))];
  const mappaCoupon = new Map<string, { compensoTipo: 'PERCENTUALE' | 'FISSO' | null; compensoValore: string | null; compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null }>();
  if (codiciCoupon.length > 0) {
    const righeCoupon = await db.select({ codice: coupon.codice, compensoTipo: coupon.compensoTipo, compensoValore: coupon.compensoValore, compensoFissoPer: coupon.compensoFissoPer })
      .from(coupon).where(inArray(coupon.codice, codiciCoupon));
    for (const c of righeCoupon) mappaCoupon.set(c.codice, c);
  }
  return calcolaCommissioneRighe(righe, mappaCoupon, defaultPercentuale);
}
