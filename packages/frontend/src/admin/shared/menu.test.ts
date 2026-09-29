import { describe, expect, it } from 'vitest';
import { GRUPPI, type SezioneGestionale } from './AdminLayout';
import { PERMESSO_SEZIONE } from './permessiSezioni';

// Il menu di sinistra è stato riorganizzato (proprietario, settembre
// 2026). Questi controlli evitano l'errore facile in un riordino:
// una sezione che esiste ma sparisce dal menu, una voce ripetuta in due
// gruppi, o una voce che chiede un permesso diverso da quello che poi
// protegge davvero la sezione.

/** Sezioni che di proposito NON sono voci di menu. */
const FUORI_MENU: SezioneGestionale[] = [
  'linee', // si apre da "Gestisci Linee" dentro un tragitto in Partenze
  'voucher', // ora dentro "Codici sconto"; l'indirizzo vecchio continua a funzionare
];

const vociDelMenu = GRUPPI.flatMap((g) => g.voci);

describe('menu del gestionale', () => {
  it('ogni sezione compare nel menu, o è una di quelle escluse apposta', () => {
    const nelMenu = new Set(vociDelMenu.map((v) => v.id));
    const mancanti = (Object.keys(PERMESSO_SEZIONE) as SezioneGestionale[])
      .filter((s) => !nelMenu.has(s) && !FUORI_MENU.includes(s));
    expect(mancanti).toEqual([]);
  });

  it('nessuna voce ripetuta in due gruppi', () => {
    const ids = vociDelMenu.map((v) => v.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('il permesso di ogni voce è quello che protegge la sezione', () => {
    const diversi = vociDelMenu.filter((v) => v.permesso !== PERMESSO_SEZIONE[v.id]).map((v) => v.id);
    expect(diversi).toEqual([]);
  });

  it('ogni gruppo ha un titolo e almeno una voce', () => {
    for (const g of GRUPPI) {
      expect(g.titolo.trim()).not.toBe('');
      expect(g.voci.length).toBeGreaterThan(0);
    }
  });
});
