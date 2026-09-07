import { describe, it, expect } from 'vitest';
import { classificaCandidato, destinatariRichiesta } from './classifica-candidato.js';

const nessuno = { fornitoreAccettatoId: null, contattatiIds: new Set<string>() };

describe('classificaCandidato — chi riceve la mail (regola decisa in conversazione)', () => {
  it('mai contattato + flag → automatico', () => {
    expect(classificaCandidato({ id: 'a', invioAutomatico: true }, nessuno)).toBe('automatico');
  });
  it('mai contattato senza flag → manuale', () => {
    expect(classificaCandidato({ id: 'a', invioAutomatico: false }, nessuno)).toBe('manuale');
  });
  it('già contattato e non scelto → oscurato, anche se ha il flag', () => {
    const ctx = { fornitoreAccettatoId: null, contattatiIds: new Set(['a']) };
    expect(classificaCandidato({ id: 'a', invioAutomatico: true }, ctx)).toBe('gia_contattato');
  });
  it('il fornitore accettato rientra, anche se già contattato', () => {
    const ctx = { fornitoreAccettatoId: 'a', contattatiIds: new Set(['a']) };
    expect(classificaCandidato({ id: 'a', invioAutomatico: false }, ctx)).toBe('accettato_in_precedenza');
  });
});

describe('destinatariRichiesta — cosa parte davvero', () => {
  const candidati = [
    { id: 'auto', statoCandidato: 'automatico' as const },
    { id: 'man', statoCandidato: 'manuale' as const },
    { id: 'old', statoCandidato: 'gia_contattato' as const },
    { id: 'fid', statoCandidato: 'accettato_in_precedenza' as const },
  ];
  it('gli automatici partono sempre, anche senza selezione', () => {
    const r = destinatariRichiesta(candidati, new Set());
    expect(r.automatici.map((c) => c.id)).toEqual(['auto']);
    expect(r.manuali).toEqual([]);
  });
  it('i manuali partono solo se selezionati', () => {
    expect(destinatariRichiesta(candidati, new Set(['man'])).manuali.map((c) => c.id)).toEqual(['man']);
  });
  it('un già-contattato NON parte nemmeno se selezionato', () => {
    expect(destinatariRichiesta(candidati, new Set(['old'])).manuali).toEqual([]);
  });
  it('il fornitore di fiducia parte se selezionato', () => {
    expect(destinatariRichiesta(candidati, new Set(['fid'])).manuali.map((c) => c.id)).toEqual(['fid']);
  });
});
