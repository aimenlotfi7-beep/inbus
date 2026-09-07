import { describe, it, expect } from 'vitest';
import { statoBundle, bundleVisibile } from './bundle-stato.js';
import { verificaComposizione, ripartisciSconto } from './bundle-regole.js';

describe('statoBundle — calcolato da date e attivo', () => {
  const b = { attivo: true, inizioVendita: '2027-03-01T09:00:00Z', fineVendita: '2027-06-30T21:59:00Z' };
  it('bozza senza date', () => expect(statoBundle({ attivo: true, inizioVendita: null, fineVendita: null })).toBe('BOZZA'));
  it('disattivato prevale su tutto', () => expect(statoBundle({ ...b, attivo: false }, new Date('2027-04-01'))).toBe('DISATTIVATO'));
  it('programmato prima dell\'inizio', () => expect(statoBundle(b, new Date('2027-02-28T23:00:00Z'))).toBe('PROGRAMMATO'));
  it('in vendita nell\'intervallo (un minuto dopo la mezzanotte italiana del 1° marzo = 23:01Z del 28 feb è ancora PRIMA delle 10:00 ora italiana)', () => {
    expect(statoBundle(b, new Date('2027-03-01T09:00:00Z'))).toBe('IN_VENDITA');
    expect(statoBundle(b, new Date('2027-03-01T08:59:59Z'))).toBe('PROGRAMMATO');
  });
  it('terminato dopo la fine', () => expect(statoBundle(b, new Date('2027-07-01'))).toBe('VENDITA_TERMINATA'));
  it('visibilità: programmato/terminato seguono i flag, bozza mai', () => {
    expect(bundleVisibile({ ...b, visibileSeProgrammato: false, visibileSeTerminato: true }, new Date('2027-01-01'))).toBe(false);
    expect(bundleVisibile({ ...b, visibileSeProgrammato: true, visibileSeTerminato: false }, new Date('2027-01-01'))).toBe(true);
    expect(bundleVisibile({ ...b, visibileSeProgrammato: true, visibileSeTerminato: true }, new Date('2027-08-01'))).toBe(true);
    expect(bundleVisibile({ attivo: true, inizioVendita: null, fineVendita: null, visibileSeProgrammato: true, visibileSeTerminato: true })).toBe(false);
  });
});

describe('verificaComposizione', () => {
  const fisso = { tipo: 'FISSO' as const, eventiIds: ['a', 'b', 'c'], minEventi: null, maxEventi: null, minPosti: 1, maxPosti: 4 };
  const libero = { ...fisso, tipo: 'LIBERO' as const, eventiIds: ['a', 'b', 'c', 'd', 'e'], minEventi: 3, maxEventi: 4 };
  const art = (ids: string[], p = 2) => ids.map((eventoId) => ({ eventoId, passeggeri: p }));
  it('fisso: servono tutti gli eventi', () => {
    expect(verificaComposizione(fisso, art(['a', 'b', 'c']))).toBeNull();
    expect(verificaComposizione(fisso, art(['a', 'b']))).toMatch(/tutti i suoi eventi/);
  });
  it('libero: rispetta min e max', () => {
    expect(verificaComposizione(libero, art(['a', 'b']))).toMatch(/almeno 3/);
    expect(verificaComposizione(libero, art(['a', 'b', 'c']))).toBeNull();
    expect(verificaComposizione(libero, art(['a', 'b', 'c', 'd', 'e']))).toMatch(/massimo 4/);
  });
  it('rifiuta eventi estranei e duplicati', () => {
    expect(verificaComposizione(fisso, art(['a', 'b', 'z']))).toMatch(/non fa parte/);
    expect(verificaComposizione(libero, art(['a', 'a', 'b']))).toMatch(/una sola volta/);
  });
  it('passeggeri uguali ovunque e dentro min/max posti', () => {
    expect(verificaComposizione(fisso, [{ eventoId: 'a', passeggeri: 2 }, { eventoId: 'b', passeggeri: 1 }, { eventoId: 'c', passeggeri: 2 }])).toMatch(/lo stesso/);
    expect(verificaComposizione(fisso, art(['a', 'b', 'c'], 5))).toMatch(/massimo 4/);
    expect(verificaComposizione({ ...fisso, minPosti: 2 }, art(['a', 'b', 'c'], 1))).toMatch(/almeno 2/);
  });
});

describe('ripartisciSconto — centesimi esatti', () => {
  it('la somma delle quote è esattamente lo sconto sul totale', () => {
    const quote = ripartisciSconto([33.33, 33.33, 33.34], 10);
    expect(quote.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10);
  });
  it('caso semplice: 20% su 50+50+50 = 10 a riga', () => {
    expect(ripartisciSconto([50, 50, 50], 20)).toEqual([10, 10, 10]);
  });
  it('l\'ultima riga assorbe la differenza di arrotondamento', () => {
    const quote = ripartisciSconto([10.005, 10.005, 10.005], 33.333);
    const totale = Math.round(30.015 * 33.333) / 100;
    expect(Math.round(quote.reduce((a, b) => a + b, 0) * 100) / 100).toBe(totale);
  });
});
