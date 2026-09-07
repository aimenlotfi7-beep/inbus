import { describe, it, expect } from 'vitest';
import { creaEventoSchema, aggiornaEventoSchema, registraPreventivoManualeSchema } from './eventi.dto.js';

const base = { artista: 'Test', genere: 'rock', luogo: 'Arena', citta: 'Bologna', data: '2030-01-01' };
const tragitto = (nome: string, arrivoCitta?: string) => ({
  nome, postiTotali: 50, fermate: [{ citta: 'Bologna', indirizzo: 'Via Roma 1' }], arrivoCitta,
});

describe('invariante: un evento ha UNA sola città di arrivo (lato server)', () => {
  it('rifiuta due città diverse tra tragitti liberi', () => {
    const r = creaEventoSchema.safeParse({ ...base, tragitti: [tragitto('A', 'Roma'), tragitto('B', 'Milano')] });
    expect(r.success).toBe(false);
  });
  it('rifiuta una città diversa dentro un servizio (vale per tutto l\'evento)', () => {
    const r = creaEventoSchema.safeParse({ ...base, tragitti: [tragitto('A', 'Roma')], servizi: [{ nome: 'S', tragitti: [tragitto('B', 'Milano')] }] });
    expect(r.success).toBe(false);
  });
  it('accetta la stessa città scritta diversa ("roma" / " ROMA ")', () => {
    const r = creaEventoSchema.safeParse({ ...base, tragitti: [tragitto('A', 'roma'), tragitto('B', ' ROMA ')] });
    expect(r.success).toBe(true);
  });
  it('accetta se solo un tragitto ha la città (gli altri la erediteranno)', () => {
    const r = creaEventoSchema.safeParse({ ...base, tragitti: [tragitto('A', 'Roma'), tragitto('B')] });
    expect(r.success).toBe(true);
  });
  it('vale anche in aggiornamento (schema partial)', () => {
    const r = aggiornaEventoSchema.safeParse({ tragitti: [tragitto('A', 'Roma'), tragitto('B', 'Napoli')] });
    expect(r.success).toBe(false);
  });
});

describe('registraPreventivoManualeSchema — limite allegato', () => {
  const ok = { preventivoCosto: 800, preventivoPostiBus: 50 };
  it('accetta un file piccolo', () => {
    expect(registraPreventivoManualeSchema.safeParse({ ...ok, fileNome: 'p.pdf', fileContenuto: 'QUJD' }).success).toBe(true);
  });
  it('rifiuta un file oltre 8MB', () => {
    const troppo = 'A'.repeat(8 * 1024 * 1024 * 4 / 3 + 1);
    expect(registraPreventivoManualeSchema.safeParse({ ...ok, fileNome: 'p.pdf', fileContenuto: troppo }).success).toBe(false);
  });
});
