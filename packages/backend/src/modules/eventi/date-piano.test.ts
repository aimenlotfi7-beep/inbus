import { describe, expect, it } from 'vitest';
import { decisioneArrivata, giorniPrima, venditeChiusePerData, type DatePiano } from './date-piano.js';

// Le due date del piano bus (proprietario, ottobre 2026): quella
// dell'evento vince su quella generale, e il conto all'indietro parte
// dalla mezzanotte di Roma del giorno dell'evento.

const evento = new Date('2027-08-07T00:00:00+02:00'); // 7 agosto 2027, ora di Roma

describe('giorni prima dell\'evento', () => {
  it('toglie i giorni e resta a mezzanotte di Roma', () => {
    const trenta = giorniPrima(evento, 30);
    expect(trenta.toISOString()).toBe(new Date('2027-07-08T00:00:00+02:00').toISOString());
    const due = giorniPrima(evento, 2);
    expect(due.toISOString()).toBe(new Date('2027-08-05T00:00:00+02:00').toISOString());
  });

  it('zero giorni = il giorno stesso dell\'evento', () => {
    expect(giorniPrima(evento, 0).toISOString()).toBe(evento.toISOString());
  });
});

describe('quando scattano', () => {
  const date: DatePiano = {
    decisione: new Date('2027-07-08T00:00:00+02:00'),
    fineVendite: new Date('2027-08-05T00:00:00+02:00'),
    decisionePersonalizzata: false,
    fineVenditePersonalizzata: false,
  };

  it('prima della decisione non si decide niente', () => {
    expect(decisioneArrivata(date, new Date('2027-07-07T23:59:00+02:00'))).toBe(false);
    expect(decisioneArrivata(date, new Date('2027-07-08T00:00:00+02:00'))).toBe(true);
    expect(decisioneArrivata(date, new Date('2027-07-20T10:00:00+02:00'))).toBe(true);
  });

  it('le vendite chiudono dalla loro data, non prima', () => {
    expect(venditeChiusePerData(date, new Date('2027-08-04T23:59:00+02:00'))).toBe(false);
    expect(venditeChiusePerData(date, new Date('2027-08-05T00:00:00+02:00'))).toBe(true);
  });

  it('senza data di fine vendite non si chiude mai (comportamento di sempre)', () => {
    const senzaChiusura: DatePiano = { ...date, fineVendite: null };
    expect(venditeChiusePerData(senzaChiusura, new Date('2027-08-07T23:00:00+02:00'))).toBe(false);
  });

  it('il piano si decide sempre prima della chiusura delle vendite', () => {
    expect(date.decisione.getTime()).toBeLessThan(date.fineVendite!.getTime());
  });
});
