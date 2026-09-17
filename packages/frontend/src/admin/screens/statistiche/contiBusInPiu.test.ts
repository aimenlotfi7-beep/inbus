import { describe, expect, it } from 'vitest';
import type { BusInPiuSimulato, EventoSimulato, TragittoSimulato } from '../../../api/statistiche';
import { conScelta, contiEvento, contiSoloConfermati, contiTragitto, effettoBus, giudizio } from './contiBusInPiu';

// Simulazione dei bus in più (proprietario, settembre 2026): interruttore per
// ogni bus, chi non parte è rimborsato, costo dal preventivo o dalla quotazione.

function bus(o: Partial<BusInPiuSimulato> = {}): BusInPiuSimulato {
  return { chiave: 'b', nome: 'Bus 2 · Linea 1', tipo: 'sotto-pareggio', lineaId: null, posti: 50, costo: 800, fonteCosto: 'quotazione', preventivi: 0, ...o };
}

/** Un bus confermato da 1.000 € con 50 a bordo; restano fuori 10 persone da 50 €
 *  (bus A) e altre 30 (bus B, che parte da una fermata successiva). */
function tragitto(o: Partial<TragittoSimulato> = {}): TragittoSimulato {
  return {
    id: 't1', nome: 'Como → Roma', passeggeri: 90, inAttesaDiRimborso: 0, busConfermati: 1, costoBusConfermati: 1000,
    busCostoStimato: 0, busSenzaCosto: 0, postiPareggio: 30,
    busInPiu: [bus({ chiave: 'A', tipo: 'proposta', costo: 900, fonteCosto: 'preventivo', preventivi: 2 }), bus({ chiave: 'B' })],
    // [passeggeri, incasso, commissioni] per combinazione: nessuno, solo A, solo B, A e B.
    esiti: [[50, 2500, 100], [80, 4000, 160], [80, 4000, 160], [90, 4500, 180]],
    ...o,
  };
}

const evento = (tragitti: TragittoSimulato[]): EventoSimulato => ({ id: 'e1', artista: 'Concerto', citta: 'Roma', data: '2026-10-17T18:00:00.000Z', anno: 2026, tragitti });

describe('conti di un tragitto', () => {
  it('di serie parte la proposta e non il bus sotto il pareggio: chi resta fuori è rimborsato', () => {
    expect(contiTragitto(tragitto(), {})).toEqual({
      passeggeri: 80, rimborsati: 10, incasso: 4000, commissioni: 160, bus: 2, costoBus: 1900, busSenzaCosto: 0, margine: 1940,
    });
  });

  it('accendendo anche il bus sotto il pareggio', () => {
    const conti = contiTragitto(tragitto(), { B: { parte: true } });
    expect(conti.passeggeri).toBe(90);
    expect(conti.rimborsati).toBe(0);
    expect(conti.costoBus).toBe(2700);
    expect(conti.margine).toBe(4500 - 2700 - 180);
  });

  it('solo i bus confermati', () => {
    expect(contiSoloConfermati(evento([tragitto()])).margine).toBe(2500 - 1000 - 100);
  });

  it('un costo scritto a mano vale al posto di preventivo e quotazione', () => {
    expect(contiTragitto(tragitto(), { A: { costo: 500 } }).costoBus).toBe(1500);
  });

  it('un bus che parte senza nessun costo conta 0 e si segnala', () => {
    const t = tragitto({ busInPiu: [bus({ chiave: 'A', tipo: 'proposta', costo: null, fonteCosto: null }), bus({ chiave: 'B' })] });
    const conti = contiTragitto(t, {});
    expect(conti.costoBus).toBe(1000);
    expect(conti.busSenzaCosto).toBe(1);
  });

  it('l\'effetto di un bus dipende da quali altri partono', () => {
    // Con A acceso, B porta solo gli ultimi 10.
    expect(effettoBus(tragitto(), 1, {})).toEqual({ passeggeri: 10, incassoNetto: 480, costo: 800, risultato: -320 });
    // Con A spento, B porta 30 persone.
    expect(effettoBus(tragitto(), 1, { A: { parte: false } })).toEqual({ passeggeri: 30, incassoNetto: 1440, costo: 800, risultato: 640 });
  });
});

describe('evento e giudizio', () => {
  it('somma i tragitti', () => {
    expect(contiEvento(evento([tragitto(), tragitto({ id: 't2' })]), {}).margine).toBe(3880);
  });

  it('guadagno, pareggio sotto l\'euro, perdita', () => {
    expect(giudizio(120)).toBe('guadagno');
    expect(giudizio(0.4)).toBe('pareggio');
    expect(giudizio(-0.6)).toBe('pareggio');
    expect(giudizio(-1)).toBe('perdita');
  });
});

describe('scelte', () => {
  it('tornata come di serie, la scelta sparisce', () => {
    const b = bus({ chiave: 'B' });
    const accesa = conScelta({}, b, { parte: true });
    expect(accesa).toEqual({ B: { parte: true } });
    expect(conScelta(accesa, b, { parte: false })).toEqual({});
    // Un costo scritto resta anche se è uguale a quello di serie (si sta ancora scrivendo).
    expect(conScelta({}, b, { costo: 800 })).toEqual({ B: { costo: 800 } });
    expect(conScelta({ B: { costo: 600 } }, b, { costo: undefined })).toEqual({});
  });
});
