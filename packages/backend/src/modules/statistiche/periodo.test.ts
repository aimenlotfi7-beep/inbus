import { describe, expect, it } from 'vitest';
import {
  aggiungiGiorni, aggiungiMesi, costruisciPeriodo, giorniTra, indiceIntervallo, inizioGiornoRoma, leggiGiorno, scriviGiorno,
  type Tratto,
} from './periodo.js';

describe('leggiGiorno', () => {
  it('legge un giorno valido', () => {
    expect(leggiGiorno('2026-06-15')).toEqual({ anno: 2026, mese: 6, giorno: 15 });
  });
  it('rifiuta formati e date impossibili', () => {
    expect(leggiGiorno('2026-02-30')).toBeNull();
    expect(leggiGiorno('15/06/2026')).toBeNull();
    expect(leggiGiorno('2026-6-15')).toBeNull();
  });
});

describe('aggiungiMesi', () => {
  it('usa l\'ultimo giorno se il mese è più corto', () => {
    expect(aggiungiMesi({ anno: 2026, mese: 3, giorno: 31 }, -1)).toEqual({ anno: 2026, mese: 2, giorno: 28 });
    expect(aggiungiMesi({ anno: 2024, mese: 2, giorno: 29 }, -12)).toEqual({ anno: 2023, mese: 2, giorno: 28 });
  });
  it('attraversa gli anni', () => {
    expect(aggiungiMesi({ anno: 2026, mese: 11, giorno: 10 }, 3)).toEqual({ anno: 2027, mese: 2, giorno: 10 });
  });
});

describe('inizioGiornoRoma', () => {
  it('è la mezzanotte di Roma, con e senza ora legale', () => {
    expect(inizioGiornoRoma({ anno: 2026, mese: 6, giorno: 15 }).toISOString()).toBe('2026-06-14T22:00:00.000Z');
    expect(inizioGiornoRoma({ anno: 2026, mese: 1, giorno: 15 }).toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });
});

describe('costruisciPeriodo', () => {
  it('12 settimane con il confronto sull\'anno prima', () => {
    const p = costruisciPeriodo('2026-06-15', '2026-09-06', 'anno');
    expect(p.granularita).toBe('settimana');
    expect(p.intervalli).toHaveLength(12);
    expect(p.intervalli[0].etichetta).toBe('15 giu');
    expect(p.fine.toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect(scriviGiorno(p.confronto!.dal)).toBe('2025-06-15');
    expect(scriviGiorno(p.confronto!.al)).toBe('2025-09-06');
    expect(p.confronto!.intervalli).toHaveLength(12);
  });

  it('il periodo precedente ha la stessa durata e finisce il giorno prima', () => {
    const p = costruisciPeriodo('2026-08-13', '2026-09-11', 'precedente');
    expect(p.granularita).toBe('giorno');
    expect(p.intervalli).toHaveLength(30);
    expect(scriviGiorno(p.confronto!.dal)).toBe('2026-07-14');
    expect(scriviGiorno(p.confronto!.al)).toBe('2026-08-12');
    expect(giorniTra(p.confronto!.dal, p.confronto!.al) + 1).toBe(30);
  });

  it('un anno a mesi, con il primo mese parziale', () => {
    const p = costruisciPeriodo('2025-09-12', '2026-09-11', 'nessuno');
    expect(p.granularita).toBe('mese');
    expect(p.confronto).toBeNull();
    expect(p.intervalli).toHaveLength(13);
    expect(p.intervalli[0].etichetta).toBe('set 2025');
    expect(p.intervalli[0].fine.toISOString()).toBe('2025-09-30T22:00:00.000Z');
    expect(p.intervalli[12].fine.toISOString()).toBe(p.fine.toISOString());
  });

  it('rifiuta periodi rovesciati o troppo lunghi', () => {
    expect(() => costruisciPeriodo('2026-09-11', '2026-09-10', 'anno')).toThrow();
    expect(() => costruisciPeriodo('2020-01-01', '2026-01-01', 'anno')).toThrow();
    expect(() => costruisciPeriodo('2026-13-01', '2026-12-01', 'anno')).toThrow();
  });
});

describe('indiceIntervallo', () => {
  const p = costruisciPeriodo('2026-09-01', '2026-09-03', 'nessuno');
  it('trova il giorno giusto di Roma, bordi compresi', () => {
    expect(indiceIntervallo(new Date('2026-08-31T22:00:00.000Z'), p.intervalli)).toBe(0);
    expect(indiceIntervallo(new Date('2026-09-01T21:59:59.999Z'), p.intervalli)).toBe(0);
    expect(indiceIntervallo(new Date('2026-09-01T22:00:00.000Z'), p.intervalli)).toBe(1);
    expect(indiceIntervallo(new Date('2026-09-03T21:59:59.000Z'), p.intervalli)).toBe(2);
  });
  it('-1 fuori dal periodo', () => {
    expect(indiceIntervallo(new Date('2026-08-31T21:59:59.000Z'), p.intervalli)).toBe(-1);
    expect(indiceIntervallo(new Date('2026-09-03T22:00:00.000Z'), p.intervalli)).toBe(-1);
  });
});

describe('periodo di confronto', () => {
  const contiguo = (t: Tratto) => {
    expect(t.intervalli[0].inizio.toISOString()).toBe(t.inizio.toISOString());
    expect(t.intervalli[t.intervalli.length - 1].fine.toISOString()).toBe(t.fine.toISOString());
    t.intervalli.slice(1).forEach((iv, i) => expect(iv.inizio.toISOString()).toBe(t.intervalli[i].fine.toISOString()));
  };

  it('precedente a mesi: gli stessi intervalli spostati indietro', () => {
    const p = costruisciPeriodo('2026-03-01', '2026-09-30', 'precedente');
    expect(p.granularita).toBe('mese');
    expect(p.intervalli).toHaveLength(7);
    const c = p.confronto!;
    expect(c.intervalli).toHaveLength(7);
    expect(scriviGiorno(c.dal)).toBe('2025-07-30');
    expect(scriviGiorno(c.al)).toBe('2026-02-28');
    expect(scriviGiorno(c.intervalli[1].dal)).toBe('2025-08-30');
    contiguo(c);
  });

  it('anno prima con il 29 febbraio', () => {
    const c = costruisciPeriodo('2028-02-27', '2028-03-01', 'anno').confronto!;
    expect(scriviGiorno(c.dal)).toBe('2027-02-27');
    expect(scriviGiorno(c.al)).toBe('2027-03-01');
    expect(c.intervalli.map((i) => scriviGiorno(i.dal))).toEqual(['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-01']);
    expect(c.intervalli[2].fine.getTime()).toBe(c.intervalli[2].inizio.getTime());
    contiguo(c);
  });

  it('anno prima a settimane', () => {
    const c = costruisciPeriodo('2026-06-15', '2026-09-06', 'anno').confronto!;
    expect(c.intervalli).toHaveLength(12);
    expect(scriviGiorno(c.intervalli[1].dal)).toBe('2025-06-22');
    contiguo(c);
  });
});

describe('ora legale e durata massima', () => {
  it('i giorni del cambio dell\'ora durano 23 e 25 ore', () => {
    const marzo = costruisciPeriodo('2026-03-29', '2026-03-29', 'nessuno').intervalli[0];
    expect(marzo.inizio.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect((marzo.fine.getTime() - marzo.inizio.getTime()) / 3_600_000).toBe(23);
    const ottobre = costruisciPeriodo('2026-10-25', '2026-10-25', 'nessuno').intervalli[0];
    expect(ottobre.inizio.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect((ottobre.fine.getTime() - ottobre.inizio.getTime()) / 3_600_000).toBe(25);
  });

  it('tre anni sì, un giorno in più no', () => {
    const dal = leggiGiorno('2023-09-12')!;
    expect(() => costruisciPeriodo('2023-09-12', scriviGiorno(aggiungiGiorni(dal, 1095)), 'nessuno')).not.toThrow();
    expect(() => costruisciPeriodo('2023-09-12', scriviGiorno(aggiungiGiorni(dal, 1096)), 'nessuno')).toThrow();
  });
});
