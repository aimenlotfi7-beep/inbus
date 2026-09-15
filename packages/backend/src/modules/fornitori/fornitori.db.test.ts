import { beforeEach, describe, expect, it } from 'vitest';
import { fornitoriService } from './fornitori.routes.js';
import { creaAmministratore, creaFornitore, svuotaDatabase } from '../../../test/dati.js';
import { posta } from '../../../test/posta.js';

// Fornitori che si registrano dal sito: conferma a loro, avviso allo staff,
// email quando vengono approvati.

beforeEach(svuotaDatabase);

describe('registrazione dal sito', () => {
  it('conferma al fornitore e avviso a chi può approvarlo, non agli altri', async () => {
    const proprietario = await creaAmministratore({ owner: true });
    const senzaPermesso = await creaAmministratore({ owner: false });
    await fornitoriService.registraPubblico({ nome: 'Bus Sud', email: 'info@bussud.example.com', indirizzo: 'Via Roma 1, Bari' });

    const alFornitore = posta.find((e) => e.a === 'info@bussud.example.com');
    expect(alFornitore?.oggetto).toContain('Bus Sud');
    const allostaff = posta.filter((e) => e.oggetto.startsWith('Nuovo fornitore da approvare'));
    expect(allostaff.map((e) => e.a)).toEqual([proprietario.email]);
    expect(allostaff[0].html).toContain('sezione=fornitori');
    expect(posta.some((e) => e.a === senzaPermesso.email)).toBe(false);
  });
});

describe('approvazione', () => {
  it('da "in attesa" ad "approvato": parte l\'email al fornitore', async () => {
    const f = await creaFornitore({ stato: 'IN_ATTESA' });
    const esito = await fornitoriService.cambiaStato(f.id, 'APPROVATO');
    expect(esito.approvazioneComunicata).toBe(true);
    expect(posta.filter((e) => e.a === f.email).map((e) => e.oggetto)).toEqual(['Registrazione approvata — OnWay']);
  });

  it('riattivare un fornitore disattivato non manda niente', async () => {
    const f = await creaFornitore({ stato: 'DISATTIVATO' });
    expect((await fornitoriService.cambiaStato(f.id, 'APPROVATO')).approvazioneComunicata).toBeNull();
    expect(posta).toHaveLength(0);
  });
});
