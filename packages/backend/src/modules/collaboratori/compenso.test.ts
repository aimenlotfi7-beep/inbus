import { describe, expect, it } from 'vitest';
import { calcolaCompenso, descriviRegola } from './compenso.js';

// Un evento con 1.000 € di valore delle prenotazioni, 700 € pagati davvero
// (gli altri sono acconti con il saldo che manca) e 400 € di margine
// previsto (100 € a oggi).
const base = { incasso: 1000, incassato: 700, margine: 400, margineAOggi: 100 };

describe('calcolaCompenso', () => {
  it('fisso: la stessa cifra prevista e a oggi', () => {
    expect(calcolaCompenso({ tipo: 'FISSO', valore: 300 }, base)).toEqual({ previsto: 300, aOggi: 300 });
  });

  it("percentuale sull'incasso: sul valore delle prenotazioni, e a oggi su quanto è stato pagato", () => {
    expect(calcolaCompenso({ tipo: 'PERCENTUALE_INCASSO', valore: 8 }, base)).toEqual({ previsto: 80, aOggi: 56 });
  });

  it('percentuale sul margine', () => {
    expect(calcolaCompenso({ tipo: 'PERCENTUALE_MARGINE', valore: 10 }, base)).toEqual({ previsto: 40, aOggi: 10 });
  });

  it('sul margine, un evento in perdita non dà compenso (mai negativo)', () => {
    expect(calcolaCompenso({ tipo: 'PERCENTUALE_MARGINE', valore: 10 }, { ...base, margine: -250, margineAOggi: -600 })).toEqual({ previsto: 0, aOggi: 0 });
  });

  it("sull'incasso invece il compenso c'è anche se l'evento è in perdita", () => {
    expect(calcolaCompenso({ tipo: 'PERCENTUALE_INCASSO', valore: 5 }, { ...base, margine: -250 }).previsto).toBe(50);
  });

  it('arrotonda al centesimo', () => {
    expect(calcolaCompenso({ tipo: 'PERCENTUALE_INCASSO', valore: 7.5 }, { ...base, incasso: 333.33 }).previsto).toBe(25);
  });
});

describe('descriviRegola', () => {
  it('scrive la regola come la legge il proprietario', () => {
    expect(descriviRegola({ tipo: 'FISSO', valore: 300 })).toBe('300 € fisso');
    expect(descriviRegola({ tipo: 'PERCENTUALE_INCASSO', valore: 8 })).toBe("8% sull'incasso");
    expect(descriviRegola({ tipo: 'PERCENTUALE_MARGINE', valore: 12.5 })).toBe('12,5% sul margine');
  });
});
