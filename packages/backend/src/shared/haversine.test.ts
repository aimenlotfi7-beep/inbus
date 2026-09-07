import { describe, it, expect } from 'vitest';
import { distanzaKm } from './haversine.js';

describe('distanzaKm (haversine, linea d\'aria)', () => {
  it('Roma–Milano è circa 477 km', () => {
    expect(distanzaKm(41.9028, 12.4964, 45.4642, 9.19)).toBeCloseTo(477, -1);
  });
  it('stesso punto = 0', () => {
    expect(distanzaKm(44.4949, 11.3426, 44.4949, 11.3426)).toBe(0);
  });
  it('è simmetrica', () => {
    const a = distanzaKm(41.9028, 12.4964, 45.4642, 9.19);
    const b = distanzaKm(45.4642, 9.19, 41.9028, 12.4964);
    expect(a).toBeCloseTo(b, 6);
  });
  it('Bologna–Modena (~37 km) rientra in un raggio di 40 ma non di 30', () => {
    const d = distanzaKm(44.4949, 11.3426, 44.6471, 10.9252);
    expect(d).toBeLessThan(40);
    expect(d).toBeGreaterThan(30);
  });
});
