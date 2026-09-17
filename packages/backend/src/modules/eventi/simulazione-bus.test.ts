import { describe, expect, it } from 'vitest';
import { calcolaProposte, PREFISSO_LINEA_SENZA_BUS, type Bozza, type DatiProposte, type StatoProposte } from './linee-da-confermare.service.js';
import { busDellaSimulazione, esitiCombinazioni, lineeEBus, type BusDellaSimulazione, type GruppoConIncasso } from './simulazione-bus.js';
import type { BusDaRiempire } from '../prenotazioni/riempimento-bus.js';

// Simulazione economica dei bus (regole del proprietario, settembre 2026):
// anche sotto il pareggio, chi non parte è rimborsato e non conta; incasso e
// spesa per bus e per linea.

let n = 0;
const gruppo = (citta: string, passeggeri: number, extra: Partial<GruppoConIncasso> = {}): GruppoConIncasso => ({
  id: `g${++n}`, fermataCitta: citta, passeggeri, eta: 30, creataIl: new Date(Date.UTC(2026, 8, 1, 0, n)), busId: null,
  incasso: 20 * passeggeri, daIncassare: 0, promoter: 0, whiteLabel: 0, rimborsoInAttesa: false, ...extra,
});
const persone = (citta: string, quante: number) => Array.from({ length: quante }, () => gruppo(citta, 1));
const busSu = (id: string, posti: number, citta: string[], primaFermata = 0): BusDaRiempire => ({ busId: id, postiBus: posti, fermate: new Set(citta), primaFermata });
const inPiu = (bus: BusDellaSimulazione[]) => bus.filter((b) => b.interruttore !== null);
/** Passeggeri che partono in ogni combinazione, sommando i bus. */
const partonoPerCombinazione = (esiti: ReturnType<typeof esitiCombinazioni>) => esiti.map((perBus) => perBus.reduce((s, e) => s + e[0], 0));

const como = { id: 'como', citta: 'Como' };
const saronno = { id: 'saronno', citta: 'Saronno' };

function stato(dati: DatiProposte, extra: Partial<StatoProposte> = {}): StatoProposte {
  return {
    necessarie: calcolaProposte(dati).proposte, contatore: null, bozze: [], tutte: [], principale: { id: 'l1', nome: 'Linea 1', bus: 1 }, dati,
    infoBus: new Map([['b1', { lineaId: 'l1', lineaNome: 'Linea 1', riferimento: 'AB123CD' }]]),
    ...extra,
  };
}

const base: DatiProposte = {
  gruppi: [], bus: [busSu('b1', 50, ['Como', 'Saronno'])], busConfermati: 1, fermateOrdinate: [como, saronno],
  fermateLineaPrincipale: ['como', 'saronno'], lineeConfermate: 1, postiPareggio: 30, postiPerBus: 50,
};

describe('i bus della simulazione', () => {
  it('sotto il pareggio: 10 fuori con pareggio 30, nessuna proposta ma un bus in più sulla stessa linea', () => {
    const dati = { ...base, gruppi: persone('Como', 60) };
    const bus = busDellaSimulazione('t1', stato(dati));
    expect(bus.map((b) => [b.chiave, b.tipo, b.interruttore, b.lineaChiave])).toEqual([
      ['b1', 'confermato', null, 'linea:l1'],
      ['t1:bus-in-piu:1', 'sotto-pareggio', 0, 'linea:l1'],
    ]);
    // Spento: 50 sul bus confermato, gli altri 10 rimborsati. Acceso: 10 sul bus in più.
    expect(esitiCombinazioni(dati.gruppi, bus)).toEqual([
      [[50, 1000, 0, 0, 0], [0, 0, 0, 0, 0]],
      [[50, 1000, 0, 0, 0], [10, 200, 0, 0, 0]],
    ]);
  });

  it('prima le proposte salvate (i loro preventivi), poi i bus sotto il pareggio, numerati dentro la linea', () => {
    const dati = { ...base, gruppi: persone('Como', 110) };
    const bozza: Bozza = { id: 'prop1', nome: 'Bus 2 · Linea 1', ordine: 1, creatoIl: new Date(), fermateIds: ['como', 'saronno'] };
    const bus = busDellaSimulazione('t1', stato(dati, { bozze: [bozza] }));
    expect(inPiu(bus).map((b) => [b.chiave, b.tipo, b.lineaIdPreventivi])).toEqual([
      ['proposta:prop1', 'proposta', 'prop1'],
      ['t1:bus-in-piu:2', 'sotto-pareggio', null],
    ]);
    const { linee, bus: risposta } = lineeEBus(bus, ['Como', 'Saronno'], () => ({ costo: 500, fonteCosto: 'quotazione', preventivi: 0 }));
    expect(linee).toEqual([{ chiave: 'linea:l1', nome: 'Linea 1', fermate: ['Como', 'Saronno'] }]);
    expect(risposta.map((b) => [b.nome, b.riferimento, b.linea])).toEqual([['Bus 1', 'AB123CD', 0], ['Bus 2', null, 0], ['Bus 3', null, 0]]);
  });

  it('una linea confermata senza bus è un bus in più: spenta, i suoi passeggeri non partono', () => {
    const dati: DatiProposte = { ...base, gruppi: [gruppo('Saronno', 10)], bus: [busSu(`${PREFISSO_LINEA_SENZA_BUS}l2`, 50, ['Saronno'], 1)] };
    const bus = busDellaSimulazione('t1', stato(dati, {
      infoBus: new Map([[`${PREFISSO_LINEA_SENZA_BUS}l2`, { lineaId: 'l2', lineaNome: 'Linea 2', riferimento: null }]]),
    }));
    expect(bus.map((b) => [b.chiave, b.tipo, b.interruttore, b.lineaNome, b.lineaIdPreventivi])).toEqual([['linea:l2', 'linea-senza-bus', 0, 'Linea 2', 'l2']]);
    expect(esitiCombinazioni(dati.gruppi, bus)).toEqual([[[0, 0, 0, 0, 0]], [[10, 200, 0, 0, 0]]]);
  });

  it('ogni combinazione rifà lo smistamento; chi sale dopo le prime fermate ha una linea nuova', () => {
    // Bus confermato da 15 su Como-Saronno; restano fuori un gruppo da 9 di Como e uno da 9 di Saronno.
    const dati: DatiProposte = {
      ...base,
      bus: [busSu('b1', 15, ['Como', 'Saronno'])],
      gruppi: [gruppo('Como', 15, { busId: 'b1' }), gruppo('Como', 9), gruppo('Saronno', 9)],
      postiPareggio: 9,
      postiPerBus: 15,
    };
    const bus = busDellaSimulazione('t1', stato(dati));
    expect(inPiu(bus).map((b) => [b.lineaChiave, b.lineaNome])).toEqual([['linea:l1', 'Linea 1'], ['linea-nuova:saronno', 'Linea nuova da Saronno']]);
    expect(partonoPerCombinazione(esitiCombinazioni(dati.gruppi, bus))).toEqual([15, 24, 24, 33]);
  });

  it('commissioni e quote White Label restano sul bus su cui sale il gruppo', () => {
    const gruppi = [gruppo('Como', 4, { promoter: 8, whiteLabel: 3 })];
    expect(esitiCombinazioni(gruppi, busDellaSimulazione('t1', stato({ ...base, gruppi })))).toEqual([[[4, 80, 8, 3, 0]]]);
  });

  it('di un acconto conta solo quanto è stato pagato; il saldo che manca è a parte', () => {
    const gruppi = [gruppo('Como', 2, { incasso: 40, daIncassare: 60 }), gruppo('Como', 1)];
    expect(esitiCombinazioni(gruppi, busDellaSimulazione('t1', stato({ ...base, gruppi })))).toEqual([[[3, 60, 0, 0, 60]]]);
  });

  it('chi ha un rimborso in attesa tiene il posto ma non conta', () => {
    const gruppi = [gruppo('Como', 40), gruppo('Como', 10, { rimborsoInAttesa: true, incasso: 200, promoter: 5 })];
    expect(esitiCombinazioni(gruppi, busDellaSimulazione('t1', stato({ ...base, gruppi })))).toEqual([[[40, 800, 0, 0, 0]]]);
  });

  it('al massimo il numero di bus in più indicato', () => {
    const dati = { ...base, gruppi: persone('Como', 500) };
    const bus = busDellaSimulazione('t1', stato(dati), 3);
    expect(inPiu(bus)).toHaveLength(3);
    expect(esitiCombinazioni(dati.gruppi, bus)).toHaveLength(8);
  });

  it('i gruppi senza un bus che li possa portare restano fuori in ogni combinazione', () => {
    const dati = { ...base, gruppi: [...persone('Como', 50), gruppo('Como', 60)] };
    const bus = busDellaSimulazione('t1', stato(dati));
    expect(inPiu(bus)).toHaveLength(0);
    expect(esitiCombinazioni(dati.gruppi, bus)).toEqual([[[50, 1000, 0, 0, 0]]]);
  });
});
