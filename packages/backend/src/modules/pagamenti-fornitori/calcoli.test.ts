import { describe, expect, it } from 'vitest';
import { perFornitore, riepilogo, residuoSpesa, spesaInScadenza, spesaScaduta, statoSpesa } from './calcoli.js';

const OGGI = new Date('2026-10-10T09:00:00Z');
const giorno = (g: string) => new Date(`${g}T00:00:00Z`);
const spesa = (o: Partial<Parameters<typeof statoSpesa>[0]> = {}) =>
  ({ importo: 1000, pagato: 0, annullata: false, scadenza: null, ...o });

describe('stato di una spesa', () => {
  it('senza pagamenti è da pagare, con una parte è parziale, saldata è pagata', () => {
    expect(statoSpesa(spesa())).toBe('DA_PAGARE');
    expect(statoSpesa(spesa({ pagato: 300 }))).toBe('PARZIALE');
    expect(statoSpesa(spesa({ pagato: 1000 }))).toBe('PAGATA');
  });

  it('annullata resta annullata anche se qualcosa era già stato pagato', () => {
    expect(statoSpesa(spesa({ pagato: 300, annullata: true }))).toBe('ANNULLATA');
    expect(residuoSpesa(spesa({ pagato: 300, annullata: true }))).toBe(0);
  });

  it('gli arrotondamenti di più acconti non lasciano una spesa "quasi pagata"', () => {
    expect(statoSpesa(spesa({ importo: 100, pagato: 33.33 + 33.33 + 33.34 }))).toBe('PAGATA');
    expect(residuoSpesa(spesa({ importo: 100, pagato: 33.33 + 33.33 + 33.34 }))).toBe(0);
  });

  it('pagato più del dovuto: il residuo è zero, mai negativo', () => {
    expect(residuoSpesa(spesa({ importo: 100, pagato: 150 }))).toBe(0);
  });
});

describe('scadenze', () => {
  it('scaduta solo se la data è passata e resta qualcosa da pagare', () => {
    expect(spesaScaduta(spesa({ scadenza: giorno('2026-10-01') }), OGGI)).toBe(true);
    expect(spesaScaduta(spesa({ scadenza: giorno('2026-10-01'), pagato: 1000 }), OGGI)).toBe(false);
    expect(spesaScaduta(spesa({ scadenza: giorno('2026-10-20') }), OGGI)).toBe(false);
    expect(spesaScaduta(spesa(), OGGI)).toBe(false); // senza scadenza non è in ritardo
  });

  it('in scadenza = entro i prossimi 7 giorni, non quelle già scadute', () => {
    expect(spesaInScadenza(spesa({ scadenza: giorno('2026-10-15') }), OGGI, 7)).toBe(true);
    expect(spesaInScadenza(spesa({ scadenza: giorno('2026-10-25') }), OGGI, 7)).toBe(false);
    expect(spesaInScadenza(spesa({ scadenza: giorno('2026-10-01') }), OGGI, 7)).toBe(false);
  });
});

describe('riepilogo', () => {
  const spese = [
    { ...spesa({ importo: 1000, pagato: 400, scadenza: giorno('2026-10-01') }), haFattura: true },
    { ...spesa({ importo: 500, pagato: 500 }), haFattura: true },
    { ...spesa({ importo: 300, scadenza: giorno('2026-10-12') }), haFattura: false },
    { ...spesa({ importo: 900, annullata: true }), haFattura: false },
  ];

  it('somma solo le spese non annullate, separando scaduto e in scadenza', () => {
    expect(riepilogo(spese, OGGI)).toEqual({
      numero: 3,
      totale: 1800,
      pagato: 900,
      daPagare: 900,
      scaduto: 600,
      inScadenza: 300,
      senzaFattura: 1,
    });
  });

  it('per fornitore: dal debito più alto', () => {
    const conFornitore = [
      { ...spesa({ importo: 1000 }), fornitoreId: 'a', fornitoreNome: 'Autolinee A' },
      { ...spesa({ importo: 200, pagato: 200 }), fornitoreId: 'b', fornitoreNome: 'Bus B' },
      { ...spesa({ importo: 400 }), fornitoreId: 'b', fornitoreNome: 'Bus B' },
    ];
    expect(perFornitore(conFornitore)).toEqual([
      { fornitoreId: 'a', fornitoreNome: 'Autolinee A', totale: 1000, pagato: 0, daPagare: 1000 },
      { fornitoreId: 'b', fornitoreNome: 'Bus B', totale: 600, pagato: 200, daPagare: 400 },
    ]);
  });
});
