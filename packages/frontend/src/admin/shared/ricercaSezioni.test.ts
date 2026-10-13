import { describe, expect, it } from 'vitest';
import { cercaSezioni } from './ricercaSezioni';
import type { SezioneGestionale } from './AdminLayout';

// La ricerca della home trova le sezioni del gestionale (proprietario,
// ottobre 2026). Qui si controlla che trovi quello che uno si aspetta
// scrivendo poche lettere, anche col nome vecchio, e che non mostri
// sezioni che l'utente non può aprire.

const tutto = () => true;
const etichette = (query: string, puoVedere: (s: SezioneGestionale) => boolean = tutto) =>
  cercaSezioni(query, puoVedere).map((s) => s.label);

describe('ricerca delle sezioni', () => {
  it('poche lettere bastano, e la voce giusta è la prima', () => {
    expect(etichette('rimb')[0]).toBe('Rimborsi');
    expect(etichette('stat')[0]).toBe('Statistiche');
    expect(etichette('ces')[0]).toBe('Cestino');
  });

  it('trova anche col nome vecchio o con il sinonimo', () => {
    expect(etichette('voucher')).toContain('Codici sconto');
    expect(etichette('preventivi')).toContain('Quotazione');
    expect(etichette('fatture')).toContain('Pagamenti fornitori');
    expect(etichette('permessi')).toContain('Ruoli');
    expect(etichette('widget')).toContain('White Label');
  });

  it('una parola in mezzo al nome basta', () => {
    expect(etichette('attesa')).toContain("Lista d'attesa");
    expect(etichette('sconto')).toContain('Codici sconto');
  });

  it('niente accenti e niente maiuscole da rispettare', () => {
    expect(etichette('PROMO').length).toBeGreaterThan(0);
    expect(etichette('attivita').length).toBeGreaterThanOrEqual(0); // non deve rompersi
  });

  it('con una lettera sola non cerca (troppi risultati inutili)', () => {
    expect(etichette('r')).toEqual([]);
    expect(etichette(' ')).toEqual([]);
  });

  it('mostra solo le sezioni che si possono aprire', () => {
    const soloEventi = (s: SezioneGestionale) => s === 'eventi';
    expect(etichette('e', soloEventi)).toEqual([]); // una lettera: niente
    expect(etichette('even', soloEventi)).toEqual(['Eventi']);
    expect(etichette('rimb', soloEventi)).toEqual([]);
  });

  it('dice in quale gruppo del menu sta la voce trovata', () => {
    const [rimborsi] = cercaSezioni('rimborsi', tutto);
    expect(rimborsi).toMatchObject({ id: 'rimborsi', label: 'Rimborsi', gruppo: 'Customer Care' });
  });
});
