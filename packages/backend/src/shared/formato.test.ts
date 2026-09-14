import { describe, expect, it } from 'vitest';
import { escapaHtml, fineGiornoRoma, formattaData, formattaEuro, giornoARoma, inizioGiornoRoma, inizioOggiRoma, istanteOraRoma, leggiOrario, orarioLeggibile } from './formato.js';
import { senzaSegreti } from './segreti.js';

// Il server gira in UTC (Railway): tutte le date si ragionano sull'ora di Roma.

describe('prezzi nei testi', () => {
  it('"96,00 €"', () => {
    expect(formattaEuro(96)).toMatch(/^96,00\s€$/);
    expect(formattaEuro('12.5')).toMatch(/^12,50\s€$/);
  });

  it('un valore non numerico diventa 0,00 €, mai "NaN €"', () => {
    expect(formattaEuro('abc')).toMatch(/^0,00\s€$/);
    expect(formattaEuro(null)).toMatch(/^0,00\s€$/);
  });
});

describe('ora di Roma', () => {
  it('d\'estate le 18:30 di Roma sono le 16:30 UTC', () => {
    expect(istanteOraRoma(2026, 9, 5, 18, 30).toISOString()).toBe('2026-09-05T16:30:00.000Z');
  });

  it('d\'inverno le 18:30 di Roma sono le 17:30 UTC', () => {
    expect(istanteOraRoma(2026, 12, 5, 18, 30).toISOString()).toBe('2026-12-05T17:30:00.000Z');
  });

  it('il giorno del cambio dell\'ora legale (25 ottobre 2026)', () => {
    expect(istanteOraRoma(2026, 10, 25, 0, 0).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(istanteOraRoma(2026, 10, 25, 12, 0).toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('le 23:30 UTC del 5 settembre sono già il 6 settembre a Roma', () => {
    expect(giornoARoma(new Date('2026-09-05T23:30:00Z'))).toEqual({ anno: 2026, mese: 9, giorno: 6 });
    expect(formattaData(new Date('2026-09-05T23:30:00Z'))).toBe('06/09/2026');
  });

  it('inizio e fine di una giornata a Roma', () => {
    const istante = new Date('2026-09-30T10:00:00Z');
    expect(inizioGiornoRoma(istante).toISOString()).toBe('2026-09-29T22:00:00.000Z');
    expect(fineGiornoRoma(istante).toISOString()).toBe('2026-09-30T22:00:00.000Z');
  });

  it('alle 01:00 di Roma un evento di oggi non è ancora passato', () => {
    const adesso = new Date('2026-09-05T23:00:00Z'); // 01:00 del 6 settembre a Roma
    const eventoDiOggi = istanteOraRoma(2026, 9, 6, 0, 0);
    expect(eventoDiOggi >= inizioOggiRoma(adesso)).toBe(true);
  });
});

describe('orari scritti a mano', () => {
  it('"8.05", "18:30" e "18:30:00" si leggono', () => {
    expect(orarioLeggibile('8.05')).toBe('08:05');
    expect(leggiOrario('18:30')).toEqual({ ore: 18, minuti: 30 });
    expect(orarioLeggibile('18:30:00')).toBe('18:30');
  });

  it('un orario impossibile non si legge', () => {
    expect(leggiOrario('25:00')).toBeNull();
    expect(leggiOrario('mattina')).toBeNull();
  });
});

describe('sicurezza dei testi e delle risposte', () => {
  it('un nome con codice HTML non diventa codice nell\'email', () => {
    expect(escapaHtml('<script>alert("x")</script> & \'y\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });

  it('password e token non escono mai dal server', () => {
    const riga = senzaSegreti({ id: '1', email: 'a@b.it', passwordHash: 'hash', tokenResetPassword: 't', tokenVerificaEmail: 'v' });
    expect(riga).toEqual({ id: '1', email: 'a@b.it', passwordImpostata: true });
  });
});
