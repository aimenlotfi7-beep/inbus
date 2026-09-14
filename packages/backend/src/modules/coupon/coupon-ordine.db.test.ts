import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupon } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { couponService } from './coupon.service.js';
import { creaCliente, creaCoupon, creaEvento, creaFermata, creaTragitto, fraGiorni, impostazione, riga, svuotaDatabase } from '../../../test/dati.js';

// Coupon: vale UNA volta per ordine (deciso dal proprietario), con il database vero.

const usi = async (codice: string) => (await db.select().from(coupon).where(eq(coupon.codice, codice)))[0].usiAttuali;

/** Due eventi, ognuno con una fermata: A a 45 €, B a 32 €. */
async function dueEventi(prezzoA = '45', prezzoB = '32') {
  const cliente = await creaCliente();
  const eventoA = await creaEvento({ artista: 'Evento A' });
  const tragittoA = await creaTragitto(eventoA.id);
  const fermataA = await creaFermata(tragittoA.id, { prezzo: prezzoA });
  const eventoB = await creaEvento({ artista: 'Evento B' });
  const tragittoB = await creaTragitto(eventoB.id);
  const fermataB = await creaFermata(tragittoB.id, { citta: 'Napoli', prezzo: prezzoB });
  return {
    cliente,
    eventoA, eventoB,
    A: { eventoId: eventoA.id, tragittoId: tragittoA.id, fermataId: fermataA.id },
    B: { eventoId: eventoB.id, tragittoId: tragittoB.id, fermataId: fermataB.id },
  };
}

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('credito_per_passeggero', 0);
});

describe('coupon in un carrello con più eventi', () => {
  it('sconto fisso di 10 €: 10 € in tutto, non 10 € per riga, e un solo uso contato', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'FISSO10', tipo: 'FISSO', valore: '10', usiMax: 5 });

    const { prenotazioni } = await prenotazioniService.creaOrdine(
      [riga(s.A, s.cliente, { couponCodice: 'FISSO10' }), riga(s.B, s.cliente, { couponCodice: 'FISSO10' })], s.cliente.id,
    );
    expect(prenotazioni.reduce((somma, p) => somma + Number(p.sconto), 0)).toBe(10);
    expect(await usi('FISSO10')).toBe(1);
  });

  it('sconto fisso più grande della prima riga: il resto passa alla riga dopo', async () => {
    const s = await dueEventi('6', '32');
    await creaCoupon({ codice: 'FISSO10', tipo: 'FISSO', valore: '10' });

    const { prenotazioni } = await prenotazioniService.creaOrdine(
      [riga(s.A, s.cliente, { couponCodice: 'FISSO10' }), riga(s.B, s.cliente, { couponCodice: 'FISSO10' })], s.cliente.id,
    );
    expect(prenotazioni.map((p) => Number(p.sconto))).toEqual([6, 4]);
    expect(prenotazioni.map((p) => Number(p.totale))).toEqual([0, 28]);
  });

  it('sconto in percentuale: su ogni riga, ma un solo uso', async () => {
    const s = await dueEventi('40', '20');
    await creaCoupon({ codice: 'PERC10', tipo: 'PERCENTUALE', valore: '10' });

    const { prenotazioni } = await prenotazioniService.creaOrdine(
      [riga(s.A, s.cliente, { couponCodice: 'PERC10' }), riga(s.B, s.cliente, { couponCodice: 'PERC10' })], s.cliente.id,
    );
    expect(prenotazioni.map((p) => Number(p.sconto))).toEqual([4, 2]);
    expect(await usi('PERC10')).toBe(1);
  });

  it('coupon dell\'evento B: sconta solo la riga di B, la riga di A resta piena e senza coupon', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'SOLOB', tipo: 'PERCENTUALE', valore: '10', eventoId: s.eventoB.id });

    const { prenotazioni } = await prenotazioniService.creaOrdine(
      [riga(s.A, s.cliente, { couponCodice: 'SOLOB' }), riga(s.B, s.cliente, { couponCodice: 'SOLOB' })], s.cliente.id,
    );
    const [rigaA, rigaB] = prenotazioni;
    expect(Number(rigaA.sconto)).toBe(0);
    expect(rigaA.couponCodice).toBeNull();
    expect(Number(rigaB.sconto)).toBeCloseTo(3.2, 2);
    expect(rigaB.couponCodice).toBe('SOLOB');
  });

  it('due codici diversi nello stesso ordine: rifiutato', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'UNO', tipo: 'FISSO', valore: '5' });
    await creaCoupon({ codice: 'DUE', tipo: 'FISSO', valore: '5' });

    await expect(prenotazioniService.creaOrdine(
      [riga(s.A, s.cliente, { couponCodice: 'UNO' }), riga(s.B, s.cliente, { couponCodice: 'DUE' })], s.cliente.id,
    )).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
  });
});

describe('quando un coupon non vale', () => {
  it('coupon dell\'evento B su una prenotazione di A: rifiutato e l\'uso non viene contato', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'SOLOB', tipo: 'PERCENTUALE', valore: '10', eventoId: s.eventoB.id });

    await expect(prenotazioniService.crea(riga(s.A, s.cliente, { couponCodice: 'SOLOB' }), s.cliente.id)).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
    expect(await usi('SOLOB')).toBe(0);
  });

  it('coupon esaurito', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'ULTIMO', tipo: 'FISSO', valore: '5', usiMax: 1, usiAttuali: 1 });

    await expect(prenotazioniService.crea(riga(s.A, s.cliente, { couponCodice: 'ULTIMO' }), s.cliente.id)).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
  });

  it('l\'ultimo uso disponibile chiesto da due clienti insieme: passa uno solo', async () => {
    const s = await dueEventi();
    const altro = await creaCliente();
    await creaCoupon({ codice: 'ULTIMO', tipo: 'FISSO', valore: '5', usiMax: 1 });

    const esiti = await Promise.allSettled([
      prenotazioniService.crea(riga(s.A, s.cliente, { couponCodice: 'ULTIMO' }), s.cliente.id),
      prenotazioniService.crea(riga(s.A, altro, { couponCodice: 'ULTIMO' }), altro.id),
    ]);
    expect(esiti.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(await usi('ULTIMO')).toBe(1);
  });

  it('coupon disattivato', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'SPENTO', tipo: 'FISSO', valore: '5', attivo: false });

    await expect(prenotazioniService.crea(riga(s.A, s.cliente, { couponCodice: 'SPENTO' }), s.cliente.id)).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
  });

  it('coupon scaduto ieri: non vale; valido fino a oggi: vale fino a fine giornata', async () => {
    const s = await dueEventi();
    await creaCoupon({ codice: 'IERI', tipo: 'FISSO', valore: '5', validoAl: fraGiorni(-1) });
    await creaCoupon({ codice: 'OGGI', tipo: 'FISSO', valore: '5', validoAl: fraGiorni(0) });

    await expect(couponService.valida('IERI', 45)).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
    await expect(couponService.valida('OGGI', 45)).resolves.toMatchObject({ sconto: 5 });
  });

  it('coupon che parte domani: non ancora attivo', async () => {
    await creaCoupon({ codice: 'DOMANI', tipo: 'FISSO', valore: '5', validoDal: fraGiorni(1) });
    await expect(couponService.valida('DOMANI', 45)).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
  });
});

describe('voucher personale', () => {
  it('lo usa solo il cliente a cui è assegnato', async () => {
    const s = await dueEventi();
    const altro = await creaCliente();
    await creaCoupon({ codice: 'PERTE', tipo: 'FISSO', valore: '10', utenteId: s.cliente.id });

    // L'email scritta nel modulo non conta: vale quella dell'account che prenota.
    await expect(prenotazioniService.crea(riga(s.A, { email: s.cliente.email }, { couponCodice: 'PERTE' }), altro.id)).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
    const p = await prenotazioniService.crea(riga(s.A, s.cliente, { couponCodice: 'PERTE' }), s.cliente.id);
    expect(Number(p.sconto)).toBe(10);
  });
});
