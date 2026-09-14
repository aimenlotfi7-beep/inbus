import { describe, expect, it } from 'vitest';
import { propostePerTragitto } from './linee-da-confermare.service.js';

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
