import { describe, expect, it } from 'vitest';
import { primaFermataDellaLinea, riempiBus, type BusDaRiempire, type GruppoPasseggeri } from './riempimento-bus.js';

// Come si riempiono i bus: gruppi interi, per età, solo sulle linee che si
// fermano alla fermata, prima la linea che parte più vicino.

let n = 0;
const gruppo = (citta: string, passeggeri: number, eta: number | null, extra: Partial<GruppoPasseggeri> = {}): GruppoPasseggeri =>
  ({ id: `g${++n}`, fermataCitta: citta, passeggeri, eta, creataIl: new Date(Date.UTC(2026, 8, 1, 0, n)), busId: null, ...extra });
const ordine = ['Como', 'Saronno'];
const bus = (id: string, posti: number, citta: string[]): BusDaRiempire =>
  ({ busId: id, postiBus: posti, fermate: new Set(citta), primaFermata: primaFermataDellaLinea(citta, ordine) });

describe('riempiBus', () => {
  it('per età, dal più grande, nel primo bus con posto; un gruppo non si divide', () => {
    const giovani = gruppo('Como', 10, 20);
    const anziani = gruppo('Como', 10, 60);
    const { assegnazioni, senzaPosto } = riempiBus([giovani, anziani], [bus('b1', 15, ordine)]);
    expect(assegnazioni.get(anziani.id)).toBe('b1');
    expect(senzaPosto).toEqual([giovani]);
  });

  it('chi sale a Saronno prova prima la linea che parte da Saronno', () => {
    const saronno = gruppo('Saronno', 4, 26);
    const { assegnazioni } = riempiBus([saronno], [bus('linea1', 15, ['Como', 'Saronno']), bus('linea2', 15, ['Saronno'])]);
    expect(assegnazioni.get(saronno.id)).toBe('linea2');
  });

  it('chi sale a Como non sale su una linea che non si ferma a Como', () => {
    const como = gruppo('Como', 4, 26);
    const { senzaPosto } = riempiBus([como], [bus('linea2', 15, ['Saronno'])]);
    expect(senzaPosto).toEqual([como]);
  });

  it('chi ha già un bus resta lì e ne occupa i posti', () => {
    const giaSul = gruppo('Como', 12, 20, { busId: 'b1' });
    const nuovo = gruppo('Como', 5, 70);
    const { assegnazioni, senzaPosto, carico } = riempiBus([giaSul, nuovo], [bus('b1', 15, ordine)]);
    expect(assegnazioni.size).toBe(0);
    expect(senzaPosto).toEqual([nuovo]);
    expect(carico.get('b1')?.perFermata.get('Como')).toBe(12);
  });
});
