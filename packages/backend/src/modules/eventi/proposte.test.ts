import { describe, expect, it } from 'vitest';
import { contatorePerTragitto, propostePerTragitto } from './linee-da-confermare.service.js';

// Proposte "da confermare" (regole del proprietario, settembre 2026): il
// pareggio riparte dopo ogni bus. Bus da 50 e pareggio a 30: 30, 80, 130.

const fermate = [{ id: 'roma', prenotati: 0 }, { id: 'firenze', prenotati: 0 }, { id: 'bologna', prenotati: 0 }];
const base = { postiPareggio: 30, postiPerBus: 50, postiConfermati: 0, lineeConfermate: 0, fermateOrdinate: fermate, fermateLineaPrincipale: ['roma', 'firenze', 'bologna'] };
const quante = (passeggeri: number, extra: Partial<typeof base> = {}) => propostePerTragitto({ ...base, ...extra, passeggeri }).length;

describe('quando nasce una proposta', () => {
  it('29 passeggeri: ancora nessuna', () => {
    expect(quante(29)).toBe(0);
  });

  it('30 passeggeri: la prima', () => {
    expect(quante(30)).toBe(1);
  });

  it('79 passeggeri: sempre una; 80: la seconda; 130: la terza', () => {
    expect(quante(79)).toBe(1);
    expect(quante(80)).toBe(2);
    expect(quante(130)).toBe(3);
  });

  it('con un bus vero da 54 posti già confermato la seconda nasce a 84', () => {
    expect(quante(83, { postiConfermati: 54, lineeConfermate: 1 })).toBe(0);
    expect(quante(84, { postiConfermati: 54, lineeConfermate: 1 })).toBe(1);
  });

  it('senza preventivo non si propone nulla', () => {
    expect(propostePerTragitto({ ...base, postiPareggio: null, passeggeri: 200 })).toEqual([]);
  });
});

describe('contatore del pareggio', () => {
  // Bus da 50, pareggio 30: sempre su 30, per il prossimo bus non ancora proposto.
  const contatore = (passeggeri: number, extra: Partial<typeof base> & { busConfermati?: number } = {}) =>
    contatorePerTragitto({ ...base, busConfermati: 0, ...extra, passeggeri });

  it('prima di ogni bus conta per il 1°', () => {
    expect(contatore(12)).toEqual({ bus: 1, contati: 12, pareggio: 30 });
  });

  it('al pareggio nasce la proposta e il contatore riparte da 0 per il 2°, finché il 1° non è pieno', () => {
    expect(contatore(30)).toEqual({ bus: 2, contati: 0, pareggio: 30 });
    expect(contatore(50)).toEqual({ bus: 2, contati: 0, pareggio: 30 });
    expect(contatore(62)).toEqual({ bus: 2, contati: 12, pareggio: 30 });
    expect(contatore(80)).toEqual({ bus: 3, contati: 0, pareggio: 30 });
  });

  it('un bus confermato conta con i suoi posti veri', () => {
    expect(contatore(60, { postiConfermati: 54, lineeConfermate: 1, busConfermati: 1 })).toEqual({ bus: 2, contati: 6, pareggio: 30 });
  });

  it('come Como → Roma: bus da 15, pareggio 9, un bus confermato e 27 passeggeri → 3° bus a 0', () => {
    expect(contatore(27, { postiPareggio: 9, postiPerBus: 15, postiConfermati: 15, lineeConfermate: 1, busConfermati: 1 })).toEqual({ bus: 3, contati: 0, pareggio: 9 });
  });

  it('senza quotazione niente contatore', () => {
    expect(contatorePerTragitto({ ...base, busConfermati: 0, postiPareggio: null, passeggeri: 10 })).toBeNull();
  });
});

describe('bus in più o linea nuova', () => {
  it('la prima proposta di un tragitto senza linee è il primo bus su tutte le fermate', () => {
    expect(propostePerTragitto({ ...base, passeggeri: 30, fermateOrdinate: [{ id: 'roma', prenotati: 2 }, { id: 'firenze', prenotati: 0 }, { id: 'bologna', prenotati: 28 }] }))
      .toEqual([{ tipo: 'bus', fermateIds: ['roma', 'firenze', 'bologna'] }]);
  });

  it('una linea nuova solo se le fermate saltate stanno nei bus e dalla partenza si arriva al pareggio', () => {
    const proposte = propostePerTragitto({
      ...base, passeggeri: 90, postiConfermati: 50, lineeConfermate: 1,
      fermateOrdinate: [{ id: 'roma', prenotati: 30 }, { id: 'firenze', prenotati: 15 }, { id: 'bologna', prenotati: 45 }],
    });
    expect(proposte[0]).toEqual({ tipo: 'linea', fermateIds: ['bologna'] });
  });

  it('se le fermate saltate non stanno nei bus, un bus in più sulla linea principale', () => {
    const proposte = propostePerTragitto({
      ...base, passeggeri: 90, postiConfermati: 50, lineeConfermate: 1,
      fermateOrdinate: [{ id: 'roma', prenotati: 70 }, { id: 'firenze', prenotati: 10 }, { id: 'bologna', prenotati: 10 }],
    });
    expect(proposte[0]).toEqual({ tipo: 'bus', fermateIds: ['roma', 'firenze', 'bologna'] });
  });
});
