import { describe, expect, it } from 'vitest';
import { calcolaProposte, PREFISSO_LINEA_SENZA_BUS, type Bozza, type DatiProposte, type StatoProposte } from './linee-da-confermare.service.js';
import { busDellaSimulazione, esitiCombinazioni, type GruppoConIncasso } from './simulazione-bus.js';
import type { BusDaRiempire } from '../prenotazioni/riempimento-bus.js';

// Simulazione economica dei bus in più (regole del proprietario, settembre
// 2026): anche sotto il pareggio, chi non parte è rimborsato e non conta.

let n = 0;
const gruppo = (citta: string, passeggeri: number, extra: Partial<GruppoConIncasso> = {}): GruppoConIncasso => ({
  id: `g${++n}`, fermataCitta: citta, passeggeri, eta: 30, creataIl: new Date(Date.UTC(2026, 8, 1, 0, n)), busId: null,
  incasso: 20 * passeggeri, commissioni: 0, rimborsoInAttesa: false, ...extra,
});
const persone = (citta: string, quante: number) => Array.from({ length: quante }, () => gruppo(citta, 1));
const busSu = (id: string, posti: number, citta: string[], primaFermata = 0): BusDaRiempire => ({ busId: id, postiBus: posti, fermate: new Set(citta), primaFermata });

const como = { id: 'como', citta: 'Como' };
const saronno = { id: 'saronno', citta: 'Saronno' };

function stato(dati: DatiProposte, extra: Partial<StatoProposte> = {}): StatoProposte {
  return {
    necessarie: calcolaProposte(dati).proposte, contatore: null, bozze: [], tutte: [], principale: { nome: 'Linea 1', bus: dati.busConfermati }, dati,
    ...extra,
  };
}

const base: DatiProposte = {
  gruppi: [], bus: [busSu('b1', 50, ['Como', 'Saronno'])], busConfermati: 1, fermateOrdinate: [como, saronno],
  fermateLineaPrincipale: ['como', 'saronno'], lineeConfermate: 1, postiPareggio: 30, postiPerBus: 50,
};

describe('i bus in più', () => {
  it('sotto il pareggio: 10 fuori con pareggio 30, nessuna proposta ma un bus in più da simulare', () => {
    const dati = { ...base, gruppi: persone('Como', 60) };
    const { bus, inPiu } = busDellaSimulazione('t1', stato(dati));
    expect(inPiu).toEqual([{ chiave: 't1:bus-in-piu:1', nome: 'Bus 2 · Linea 1', tipo: 'sotto-pareggio', lineaId: null, posti: 50 }]);
    // 60 partono con il bus in più (60 × 20 €), 50 senza: gli altri 10 sono rimborsati.
    expect(esitiCombinazioni(dati.gruppi, bus)).toEqual([[50, 1000, 0], [60, 1200, 0]]);
  });

  it('prima le proposte salvate (nome e preventivi loro), poi i bus sotto il pareggio', () => {
    const dati = { ...base, gruppi: persone('Como', 90) };
    const bozza: Bozza = { id: 'prop1', nome: 'Bus 2 · Linea 1', ordine: 1, creatoIl: new Date(), fermateIds: ['como', 'saronno'] };
    const { inPiu } = busDellaSimulazione('t1', stato(dati, { bozze: [bozza] }));
    expect(inPiu.map((b) => [b.chiave, b.nome, b.tipo, b.lineaId])).toEqual([
      ['proposta:prop1', 'Bus 2 · Linea 1', 'proposta', 'prop1'],
    ]);
    // 90 persone: 50 sul bus confermato, 40 sulla proposta; nessuno resta fuori.
    const conPiu = { ...dati, gruppi: persone('Como', 110) };
    expect(busDellaSimulazione('t1', stato(conPiu, { bozze: [bozza] })).inPiu.map((b) => [b.nome, b.tipo])).toEqual([
      ['Bus 2 · Linea 1', 'proposta'],
      ['Bus 3 · Linea 1', 'sotto-pareggio'],
    ]);
  });

  it('una linea confermata senza bus è un bus in più: spenta, i suoi passeggeri non partono', () => {
    const dati: DatiProposte = {
      ...base,
      gruppi: [gruppo('Saronno', 10)],
      bus: [busSu(`${PREFISSO_LINEA_SENZA_BUS}l2`, 50, ['Saronno'], 1)],
    };
    const { bus, inPiu } = busDellaSimulazione('t1', stato(dati, { tutte: [{ id: 'l2', nome: 'Linea 2', ordine: 1 }] }));
    expect(inPiu).toEqual([{ chiave: 'linea:l2', nome: 'Bus 1 · Linea 2', tipo: 'linea-senza-bus', lineaId: 'l2', posti: 50 }]);
    expect(esitiCombinazioni(dati.gruppi, bus)).toEqual([[0, 0, 0], [10, 200, 0]]);
  });

  it('ogni combinazione rifà lo smistamento: acceso solo il secondo bus, porta lui chi portava il primo', () => {
    // Bus confermato da 15 su Como-Saronno; restano fuori un gruppo da 9 di Como e uno da 9 di Saronno.
    const dati: DatiProposte = {
      ...base,
      bus: [busSu('b1', 15, ['Como', 'Saronno'])],
      gruppi: [gruppo('Como', 15, { busId: 'b1' }), gruppo('Como', 9), gruppo('Saronno', 9)],
      postiPareggio: 9,
      postiPerBus: 15,
    };
    const { bus, inPiu } = busDellaSimulazione('t1', stato(dati));
    expect(inPiu).toHaveLength(2);
    const esiti = esitiCombinazioni(dati.gruppi, bus);
    expect(esiti.map(([passeggeri]) => passeggeri)).toEqual([15, 24, 24, 33]);
  });

  it('chi ha un rimborso in attesa tiene il posto ma non conta', () => {
    const gruppi = [gruppo('Como', 40), gruppo('Como', 10, { rimborsoInAttesa: true, incasso: 200, commissioni: 5 })];
    expect(esitiCombinazioni(gruppi, [{ ...busSu('b1', 50, ['Como']), interruttore: null }])).toEqual([[40, 800, 0]]);
  });

  it('al massimo il numero di bus in più indicato', () => {
    const dati = { ...base, gruppi: persone('Como', 500) };
    const { bus, inPiu } = busDellaSimulazione('t1', stato(dati), 3);
    expect(inPiu).toHaveLength(3);
    expect(esitiCombinazioni(dati.gruppi, bus)).toHaveLength(8);
  });

  it('i gruppi senza un bus che li possa portare restano fuori in ogni combinazione', () => {
    const dati = { ...base, gruppi: [...persone('Como', 50), gruppo('Como', 60)] };
    const { bus, inPiu } = busDellaSimulazione('t1', stato(dati));
    expect(inPiu).toHaveLength(0);
    expect(esitiCombinazioni(dati.gruppi, bus)).toEqual([[50, 1000, 0]]);
  });
});
