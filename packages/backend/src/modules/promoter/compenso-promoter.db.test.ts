import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupon, prenotazioni, promoter } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { prenotazioniComeStatistiche } from '../statistiche/statistiche.service.js';
import { commissioniPer } from '../statistiche/economia.js';
import { creaCoupon, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Commissione del promoter: vale la regola del momento della vendita (deciso
// dal proprietario, settembre 2026). Cambiare la percentuale del promoter o
// il compenso del coupon non cambia le vendite già fatte.

beforeEach(svuotaDatabase);

async function creaPromoter(percentuale: string) {
  const [p] = await db.insert(promoter).values({ nome: 'Giulia', email: 'giulia@example.com', passwordHash: 'x', codice: 'GIU123', commissionePercentuale: percentuale }).returning();
  return p;
}

async function commissioneTotale() {
  const { righe, ctx } = await prenotazioniComeStatistiche(undefined);
  return commissioniPer(righe, () => 'tutto', ctx, { quoteWhiteLabel: false }).get('tutto') ?? 0;
}

describe('compenso del promoter fissato alla vendita', () => {
  it('cambiare poi la percentuale del promoter non cambia la commissione', async () => {
    const s = await scenarioBase();
    const p = await creaPromoter('10');
    const pren = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { promoterCodice: 'GIU123' }), s.cliente.id);
    const [salvata] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pren.pnr));
    expect(salvata.compensoPromoter).toEqual({ percentuale: 10, compensoTipo: null, compensoValore: null, compensoFissoPer: null });
    expect(await commissioneTotale()).toBe(4); // 10% di 40 €

    await db.update(promoter).set({ commissionePercentuale: '25' }).where(eq(promoter.id, p.id));
    expect(await commissioneTotale()).toBe(4);

    // Anche eliminando il promoter la commissione di quella vendita resta.
    await db.delete(promoter).where(eq(promoter.id, p.id));
    expect(await commissioneTotale()).toBe(4);
  });

  it('il compenso del coupon usato resta quello del momento della vendita', async () => {
    const s = await scenarioBase();
    const p = await creaPromoter('10');
    await creaCoupon({ codice: 'RADIO', tipo: 'PERCENTUALE', valore: '10', promoterId: p.id, compensoTipo: 'FISSO', compensoValore: '3', compensoFissoPer: 'PASSEGGERO' });
    await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 2, couponCodice: 'RADIO' }), s.cliente.id);
    expect(await commissioneTotale()).toBe(6); // 3 € per 2 passeggeri

    await db.update(coupon).set({ compensoValore: '8' }).where(eq(coupon.codice, 'RADIO'));
    expect(await commissioneTotale()).toBe(6);
  });
});
