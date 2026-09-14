import { describe, expect, it } from 'vitest';
import { calcolaTempi, primaPartenza } from './partenza.js';
import { etaPrenotazione } from './smistamento.service.js';

// Quando parte il bus di una fermata, e da quando si assegna.

const orari = {
  eventoData: new Date('2026-09-19T22:00:00Z'), // 20 settembre, mezzanotte di Roma
  fermate: [{ citta: 'Roma', orario: '08:00' }, { citta: 'Firenze', orario: '10:30' }, { citta: 'Bologna', orario: null }],
};

describe('partenza di una fermata', () => {
  it('Roma alle 08:00 del giorno dell\'evento = 06:00 UTC', () => {
    expect(calcolaTempi(orari, 'Roma').partenza.toISOString()).toBe('2026-09-20T06:00:00.000Z');
  });

  it('il bus si assegna da 24 ore prima fino a 2 ore dopo la partenza', () => {
    const t = calcolaTempi(orari, 'Firenze');
    expect(t.partenza.toISOString()).toBe('2026-09-20T08:30:00.000Z');
    expect(t.disponibileDal.toISOString()).toBe('2026-09-19T08:30:00.000Z');
    expect(t.smistabileFinoAl.toISOString()).toBe('2026-09-20T10:30:00.000Z');
  });

  it('una fermata senza orario prende il primo orario del tragitto', () => {
    expect(calcolaTempi(orari, 'Bologna').partenza.toISOString()).toBe('2026-09-20T06:00:00.000Z');
  });

  it('conta l\'orario attuale della fermata, non quello salvato sulla prenotazione', () => {
    expect(calcolaTempi(orari, 'Firenze', '09:00').orarioFermata).toBe('10:30');
  });

  it('la prima partenza di un elenco', () => {
    const tempi = ['Firenze', 'Roma'].map((c) => calcolaTempi(orari, c));
    expect(primaPartenza(tempi)?.orarioFermata).toBe('08:00');
  });
});

describe('età per lo smistamento', () => {
  const evento = new Date('2026-09-20T00:00:00Z');

  it('senza date dei partecipanti vale quella del titolare', () => {
    expect(etaPrenotazione([], new Date('1996-09-20T00:00:00Z'), evento)).toBeCloseTo(30, 1);
  });

  it('con le date dei partecipanti: la loro età media', () => {
    expect(etaPrenotazione([new Date('2006-09-20T00:00:00Z'), new Date('1986-09-20T00:00:00Z')], null, evento)).toBeCloseTo(30, 1);
  });

  it('senza nessuna data: nessuna età (in fondo alla fila)', () => {
    expect(etaPrenotazione([], null, evento)).toBeNull();
  });
});
