import { describe, expect, it } from 'vitest';
import { applicaScontoOfferta, prezzoMinimoEvento, prezzoNormaleFermata } from './prezzi.js';
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

describe('il "da … €" di un evento', () => {
  const tragitto = (o: Partial<{ attivo: boolean; stato: string; prezzoExtra: string }>, fermate: { attivo: boolean; prezzo: string | null }[]) =>
    ({ attivo: true, stato: 'PREZZATO', prezzoExtra: '0', ...o, fermate });

  it('la fermata più economica che si può comprare, con l\'extra della tratta', () => {
    expect(prezzoMinimoEvento({
      prezzo: '99',
      tragitti: [
        tragitto({ prezzoExtra: '5' }, [{ attivo: true, prezzo: '40' }, { attivo: false, prezzo: '10' }]),
        tragitto({ stato: 'DA_CONFERMARE' }, [{ attivo: true, prezzo: '20' }]),
        tragitto({ attivo: false }, [{ attivo: true, prezzo: '15' }]),
      ],
      servizi: [{ tragitti: [tragitto({}, [{ attivo: true, prezzo: '42' }])] }],
    })).toBe(42); // 40 + 5 di extra = 45; la fermata spenta e i tragitti non in vendita non contano
  });

  it('senza prezzi di fermata vale quello dell\'evento, altrimenti niente', () => {
    expect(prezzoMinimoEvento({ prezzo: '35', tragitti: [tragitto({}, [{ attivo: true, prezzo: null }])], servizi: [] })).toBe(35);
    expect(prezzoMinimoEvento({ prezzo: null, tragitti: [], servizi: [] })).toBeNull();
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
