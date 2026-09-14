import { describe, expect, it } from 'vitest';
import { applicaScontoOfferta, prezzoNormaleFermata } from './prezzi.js';
import { scontoCoupon } from '../modules/coupon/coupon.service.js';

describe('prezzo di una fermata', () => {
  it('prezzo della fermata più l\'extra della tratta', () => {
    expect(prezzoNormaleFermata({ prezzo: '40' }, { prezzo: '99' }, { prezzoExtra: '5' })).toBe(45);
  });

  it('fermata senza prezzo: vale il prezzo dell\'evento, più l\'extra', () => {
    expect(prezzoNormaleFermata({ prezzo: null }, { prezzo: '35' }, { prezzoExtra: '2.5' })).toBe(37.5);
  });

  it('senza nessun prezzo: 0 (e la prenotazione viene rifiutata)', () => {
    expect(prezzoNormaleFermata({ prezzo: null }, { prezzo: null }, { prezzoExtra: '0' })).toBe(0);
  });
});

describe('sconto di un\'offerta', () => {
  it('20% su 45 € = 36 €', () => {
    expect(applicaScontoOfferta(45, { scontoPercentuale: '20' })).toBe(36);
  });

  it('senza offerta il prezzo non cambia', () => {
    expect(applicaScontoOfferta(45, null)).toBe(45);
  });
});

describe('sconto di un coupon', () => {
  it('in percentuale: 10% di 32 € = 3,20 €', () => {
    expect(scontoCoupon({ tipo: 'PERCENTUALE', valore: '10' }, 32)).toBeCloseTo(3.2, 10);
  });

  it('fisso: 10 €', () => {
    expect(scontoCoupon({ tipo: 'FISSO', valore: '10' }, 45)).toBe(10);
  });

  it('fisso più grande dell\'importo: mai sotto zero', () => {
    expect(scontoCoupon({ tipo: 'FISSO', valore: '50' }, 30)).toBe(30);
  });
});
