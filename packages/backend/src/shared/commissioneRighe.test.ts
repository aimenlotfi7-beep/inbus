import { describe, it, expect } from 'vitest';
import { calcolaCommissioneRighe } from './commissioneRighe.js';

describe('calcolaCommissioneRighe', () => {
  it('nessun coupon su nessuna riga: sempre il tasso di default', () => {
    const righe = [{ totale: 100, passeggeri: 2, couponCodice: null }, { totale: 50, passeggeri: 1, couponCodice: null }];
    expect(calcolaCommissioneRighe(righe, new Map(), 10)).toBe(15); // 10% di 150
  });

  it('coupon con compenso PERCENTUALE proprio: sostituisce il default, non si somma', () => {
    const righe = [{ totale: 100, passeggeri: 2, couponCodice: 'SDFGH' }];
    const mappa = new Map([['SDFGH', { compensoTipo: 'PERCENTUALE' as const, compensoValore: '20', compensoFissoPer: null }]]);
    expect(calcolaCommissioneRighe(righe, mappa, 10)).toBe(20); // 20% del coupon, non il 10% di default
  });

  it('coupon con compenso FISSO per ACQUISTO: stesso importo indipendentemente dai passeggeri', () => {
    const righe = [{ totale: 200, passeggeri: 5, couponCodice: 'FISSO5' }];
    const mappa = new Map([['FISSO5', { compensoTipo: 'FISSO' as const, compensoValore: '15', compensoFissoPer: 'ACQUISTO' as const }]]);
    expect(calcolaCommissioneRighe(righe, mappa, 10)).toBe(15); // non 15*5, una volta sola
  });

  it('coupon con compenso FISSO per PASSEGGERO: si moltiplica per il numero di passeggeri', () => {
    const righe = [{ totale: 200, passeggeri: 5, couponCodice: 'FISSOPASS' }];
    const mappa = new Map([['FISSOPASS', { compensoTipo: 'FISSO' as const, compensoValore: '3', compensoFissoPer: 'PASSEGGERO' as const }]]);
    expect(calcolaCommissioneRighe(righe, mappa, 10)).toBe(15); // 3€ x 5 passeggeri
  });

  it('BUG REALE gia\' capitato: un coupon usato su PIU\' righe dello stesso ordine (bundle multi-evento) — ogni riga la sua quota, il totale e\' la somma corretta, non raddoppiata', () => {
    // Questo e' esattamente lo scenario di SDFGH: un ordine con 2 eventi,
    // stesso codice su entrambe le righe (perche' e' lo stesso acquisto) —
    // qui verifichiamo che la commissione DERIVANTE sia la somma giusta
    // per riga, non un valore raddoppiato per errore di conteggio a monte.
    const righe = [
      { totale: 100, passeggeri: 2, couponCodice: 'SDFGH' },
      { totale: 80, passeggeri: 1, couponCodice: 'SDFGH' },
    ];
    const mappa = new Map([['SDFGH', { compensoTipo: 'PERCENTUALE' as const, compensoValore: '10', compensoFissoPer: null }]]);
    expect(calcolaCommissioneRighe(righe, mappa, 10)).toBe(18); // 10% di 100 + 10% di 80 = 18, non 36
  });

  it('righe miste: alcune con coupon (override), altre senza (default) — ognuna il suo calcolo', () => {
    const righe = [
      { totale: 100, passeggeri: 1, couponCodice: 'PROMO' }, // override 5€ fisso
      { totale: 100, passeggeri: 1, couponCodice: null }, // default 10%
    ];
    const mappa = new Map([['PROMO', { compensoTipo: 'FISSO' as const, compensoValore: '5', compensoFissoPer: 'ACQUISTO' as const }]]);
    expect(calcolaCommissioneRighe(righe, mappa, 10)).toBe(15); // 5 + 10
  });

  it('codice coupon non trovato nella mappa (es. eliminato nel frattempo): si comporta come se non ci fosse, usa il default', () => {
    const righe = [{ totale: 100, passeggeri: 1, couponCodice: 'FANTASMA' }];
    expect(calcolaCommissioneRighe(righe, new Map(), 10)).toBe(10);
  });

  it('coupon con promoterId ma SENZA un compenso specifico impostato: usa il default, non zero', () => {
    const righe = [{ totale: 100, passeggeri: 1, couponCodice: 'SOLOASSEGNATO' }];
    const mappa = new Map([['SOLOASSEGNATO', { compensoTipo: null, compensoValore: null, compensoFissoPer: null }]]);
    expect(calcolaCommissioneRighe(righe, mappa, 12)).toBe(12);
  });

  it('arrotonda una sola volta alla fine, non riga per riga — niente errori di arrotondamento accumulati su tanti articoli', () => {
    // 0.333... x 3 = 1 esatto SOLO se non si arrotonda a ogni singola riga.
    const righe = Array.from({ length: 3 }, () => ({ totale: 10, passeggeri: 1, couponCodice: null }));
    expect(calcolaCommissioneRighe(righe, new Map(), 3.333333)).toBeCloseTo(1, 2);
  });

  it('nessuna riga: zero, non un errore', () => {
    expect(calcolaCommissioneRighe([], new Map(), 10)).toBe(0);
  });
});
