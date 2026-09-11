import { describe, expect, it } from 'vitest';
import {
  aBlocchi, calcolaCoorti, curvaCumulativa, etaAl, fasciaAnticipo, fasciaEta, fonteDi, mediaCurve, mediana, percentuale, raggruppa,
} from './calcoli.js';

const nessunaFonte = { promoterCodice: null, canaleVendita: 'INBUS', whiteLabelId: null, utmSource: null, utmMedium: null, utmCampaign: null };
const campagne = [{ id: 'c1', nome: 'Meta agosto', utmSource: 'meta', utmMedium: null, utmCampaign: 'agosto' }];
const nomiPromoter = new Map([['GIULIA10', 'Giulia']]);
const nomiWhiteLabel = new Map([['wl1', 'Organizzatore Uno']]);

describe('fonteDi', () => {
  it('il codice promoter vince su tutto', () => {
    const f = fonteDi({ ...nessunaFonte, promoterCodice: 'GIULIA10', canaleVendita: 'WHITE_LABEL', whiteLabelId: 'wl1', utmSource: 'meta' }, campagne, nomiPromoter, nomiWhiteLabel);
    expect(f).toEqual({ tipo: 'promoter', chiave: 'promoter:GIULIA10', nome: 'Giulia' });
  });
  it('un codice sconosciuto resta un promoter', () => {
    expect(fonteDi({ ...nessunaFonte, promoterCodice: 'XX' }, campagne, nomiPromoter, nomiWhiteLabel).nome).toBe('Codice XX');
  });
  it('White Label prima delle campagne', () => {
    const f = fonteDi({ ...nessunaFonte, canaleVendita: 'WHITE_LABEL', whiteLabelId: 'wl1', utmSource: 'meta', utmCampaign: 'agosto' }, campagne, nomiPromoter, nomiWhiteLabel);
    expect(f.tipo).toBe('white_label');
    expect(f.nome).toBe('Organizzatore Uno');
  });
  it('campagna registrata solo con gli stessi tre utm', () => {
    expect(fonteDi({ ...nessunaFonte, utmSource: 'meta', utmCampaign: 'agosto' }, campagne, nomiPromoter, nomiWhiteLabel).chiave).toBe('campagna:c1');
    const altra = fonteDi({ ...nessunaFonte, utmSource: 'meta', utmMedium: 'cpc', utmCampaign: 'agosto' }, campagne, nomiPromoter, nomiWhiteLabel);
    expect(altra).toEqual({ tipo: 'utm_non_registrata', chiave: 'utm:meta/cpc', nome: 'meta / cpc' });
  });
  it('senza dati di provenienza è il sito', () => {
    expect(fonteDi(nessunaFonte, campagne, nomiPromoter, nomiWhiteLabel).tipo).toBe('sito');
  });
  it('White Label senza id resta White Label', () => {
    expect(fonteDi({ ...nessunaFonte, canaleVendita: 'WHITE_LABEL' }, campagne, nomiPromoter, nomiWhiteLabel)).toEqual({ tipo: 'white_label', chiave: 'white_label:', nome: 'White Label' });
  });
});

describe('raccolte', () => {
  it('raggruppa mantenendo l\'ordine', () => {
    const gruppi = raggruppa([{ k: 'a', n: 1 }, { k: 'b', n: 2 }, { k: 'a', n: 3 }], (r) => r.k);
    expect([...gruppi.keys()]).toEqual(['a', 'b']);
    expect(gruppi.get('a')!.map((r) => r.n)).toEqual([1, 3]);
  });
  it('aBlocchi', () => {
    expect(aBlocchi([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(aBlocchi([], 2)).toEqual([]);
  });
});

describe('fasce', () => {
  it('anticipo d\'acquisto', () => {
    expect([-3, 0, 7, 8, 14, 15, 30, 31, 60, 61, 400].map(fasciaAnticipo)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('età compiuta solo dal giorno del compleanno', () => {
    expect(etaAl({ anno: 2000, mese: 10, giorno: 17 }, { anno: 2026, mese: 10, giorno: 16 })).toBe(25);
    expect(etaAl({ anno: 2000, mese: 10, giorno: 17 }, { anno: 2026, mese: 10, giorno: 17 })).toBe(26);
  });
  it('fasce d\'età e date impossibili', () => {
    expect([17, 18, 24, 25, 34, 35, 54, 55, 90].map(fasciaEta)).toEqual([0, 1, 1, 2, 2, 3, 4, 5, 5]);
    expect(fasciaEta(-1)).toBeNull();
    expect(fasciaEta(110)).toBe(5);
    expect(fasciaEta(111)).toBeNull();
    expect(fasciaEta(130)).toBeNull();
  });
});

describe('numeri', () => {
  it('percentuale con un decimale', () => {
    expect(percentuale(1, 3)).toBe(33.3);
    expect(percentuale(5, 0)).toBe(0);
  });
  it('mediana', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('ritmo di vendita', () => {
  it('accumula dal giorno più lontano a 0', () => {
    const curva = curvaCumulativa([
      { giorniPrima: 40, passeggeri: 2 },
      { giorniPrima: 10, passeggeri: 3 },
      { giorniPrima: 0, passeggeri: 1 },
      { giorniPrima: 200, passeggeri: 4 },
      { giorniPrima: -1, passeggeri: 1 },
    ], 60);
    expect(curva).toHaveLength(61);
    expect(curva[0]).toBe(4); // 60 giorni prima
    expect(curva[60 - 40]).toBe(6);
    expect(curva[60 - 11]).toBe(6);
    expect(curva[60 - 10]).toBe(9);
    expect(curva[60]).toBe(11);
  });
  it('media punto per punto', () => {
    expect(mediaCurve([[0, 2, 4], [1, 3, 6]])).toEqual([0.5, 2.5, 5]);
    expect(mediaCurve([])).toBeNull();
  });
});

describe('calcolaCoorti', () => {
  const g = (testo: string) => {
    const [anno, mese, giorno] = testo.split('-').map(Number);
    return { anno, mese, giorno };
  };
  const oggi = g('2026-09-11');
  const coorti = calcolaCoorti([
    { utenteId: 'A', giorno: g('2026-01-10') },
    { utenteId: 'A', giorno: g('2026-02-05') },
    { utenteId: 'B', giorno: g('2026-06-01') },
    { utenteId: 'B', giorno: g('2026-01-20') },
    { utenteId: 'C', giorno: g('2025-09-01') },
    { utenteId: 'C', giorno: g('2026-01-15') },
    { utenteId: 'D', giorno: g('2026-08-20') },
    { utenteId: 'E', giorno: g('2026-03-03') },
    { utenteId: 'E', giorno: g('2026-03-03') },
  ], oggi);

  it('un mese per riga, fino a quello di oggi', () => {
    expect(coorti).toHaveLength(12);
    expect(coorti[0].mese).toBe('2025-10');
    expect(coorti[11].mese).toBe('2026-09');
    expect(coorti[3].etichetta).toBe('gen 2026');
  });
  it('conta solo la prima prenotazione in assoluto e un ritorno in un giorno diverso', () => {
    const gennaio = coorti.find((c) => c.mese === '2026-01')!;
    expect(gennaio.clienti).toBe(2); // A e B; C era già cliente da settembre 2025
    expect(gennaio.ritorno).toEqual([50, 50, 100, null]);
    const marzo = coorti.find((c) => c.mese === '2026-03')!;
    expect(marzo.clienti).toBe(1);
    expect(marzo.ritorno[0]).toBe(0);
  });
  it('fine mese: dal 31 gennaio, "entro un mese" arriva al 28 febbraio', () => {
    const [gennaio] = calcolaCoorti([
      { utenteId: 'F', giorno: g('2026-01-31') },
      { utenteId: 'F', giorno: g('2026-02-28') },
      { utenteId: 'G', giorno: g('2026-01-31') },
      { utenteId: 'G', giorno: g('2026-03-01') },
    ], oggi).filter((c) => c.mese === '2026-01');
    expect(gennaio.clienti).toBe(2);
    expect(gennaio.ritorno.slice(0, 2)).toEqual([50, 100]);
  });

  it('il valore esce solo il giorno dopo la fine della finestra', () => {
    const coorte = (giorno: string) => calcolaCoorti([{ utenteId: 'H', giorno: g('2026-07-10') }], g(giorno)).find((c) => c.mese === '2026-07')!;
    expect(coorte('2026-08-31').ritorno[0]).toBeNull();
    expect(coorte('2026-09-01').ritorno[0]).toBe(0);
  });

  it('null finché i mesi non sono passati', () => {
    const agosto = coorti.find((c) => c.mese === '2026-08')!;
    expect(agosto.clienti).toBe(1);
    expect(agosto.ritorno).toEqual([null, null, null, null]);
    expect(coorti.find((c) => c.mese === '2025-11')!.ritorno).toEqual([null, null, null, null]);
  });
});
