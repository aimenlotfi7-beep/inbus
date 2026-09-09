import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { coupon } from '../db/schema.js';

interface RigaPerCommissione {
  totale: number;
  passeggeri: number;
  couponCodice: string | null;
}

/** La commissione di un promoter NON è più sempre "fatturato totale ×
 *  un'unica percentuale" — da quando un coupon può avere un compenso
 *  proprio (percentuale diversa, o un importo fisso per acquisto o per
 *  passeggero), serve calcolarla riga per riga: ogni prenotazione usa
 *  il compenso del SUO coupon se ce l'ha, altrimenti il tasso di
 *  default dell'account del promoter. Usata sia dal report Campagne
 *  sia dalle statistiche del promoter stesso — stessa logica, un solo
 *  posto dove viverla. */
export async function calcolaCommissionePromoter(righe: RigaPerCommissione[], defaultPercentuale: number): Promise<number> {
  const codiciCoupon = [...new Set(righe.map((r) => r.couponCodice).filter((c): c is string => !!c))];
  const mappaCoupon = new Map<string, { compensoTipo: 'PERCENTUALE' | 'FISSO' | null; compensoValore: string | null; compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null }>();
  if (codiciCoupon.length > 0) {
    const righeCoupon = await db.select({ codice: coupon.codice, compensoTipo: coupon.compensoTipo, compensoValore: coupon.compensoValore, compensoFissoPer: coupon.compensoFissoPer })
      .from(coupon).where(inArray(coupon.codice, codiciCoupon));
    for (const c of righeCoupon) mappaCoupon.set(c.codice, c);
  }

  let totale = 0;
  for (const r of righe) {
    const c = r.couponCodice ? mappaCoupon.get(r.couponCodice) : undefined;
    if (c?.compensoTipo === 'FISSO' && c.compensoValore != null) {
      totale += c.compensoFissoPer === 'PASSEGGERO' ? Number(c.compensoValore) * r.passeggeri : Number(c.compensoValore);
    } else if (c?.compensoTipo === 'PERCENTUALE' && c.compensoValore != null) {
      totale += r.totale * (Number(c.compensoValore) / 100);
    } else {
      totale += r.totale * (defaultPercentuale / 100);
    }
  }
  return Math.round(totale * 100) / 100;
}
