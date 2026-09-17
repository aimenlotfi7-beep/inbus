import { describe, expect, it } from 'vitest';
import type { BusSimulato, EventoSimulato, TragittoSimulato } from '../../../api/statistiche';
import { conScelta, contiEvento, contiTragitto, giudizio, risultato, spesa } from './contiBusInPiu';

// Bus in più (proprietario, settembre 2026): interruttore per ogni bus, chi non
// parte è rimborsato, spesa = bus + commissioni, numeri per linea e per bus.

function bus(o: Partial<BusSimulato> = {}): BusSimulato {
  return { chiave: 'b', nome: 'Bus 1', riferimento: null, tipo: 'confermato', linea: 0, posti: 15, interruttore: null, costo: 550, fonteCosto: 'bus', preventivi: 0, ...o };
}

/** Linea 1 con un bus confermato (550 €) e due bus in più: Bus 2 proposta (600 €),
 *  Bus 3 sotto il pareggio (600 €). Esiti per bus: [passeggeri, incasso pagato, promoter, White Label, saldi da incassare]. */
function tragitto(o: Partial<TragittoSimulato> = {}): TragittoSimulato {
  return {
    id: 't1', nome: 'Da Como', passeggeri: 32, inAttesaDiRimborso: 0, incasso: 1085,
    linee: [{ chiave: 'linea:l1', nome: 'Linea 1', fermate: ['Como', 'Saronno'] }],
    bus: [
      bus({ chiave: 'B1' }),
      bus({ chiave: 'B2', nome: 'Bus 2', tipo: 'proposta', interruttore: 0, costo: 600, fonteCosto: 'quotazione' }),
      bus({ chiave: 'B3', nome: 'Bus 3', tipo: 'sotto-pareggio', interruttore: 1, costo: 600, fonteCosto: 'quotazione' }),
    ],
    esiti: [
      [[15, 525, 20, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
      [[15, 525, 20, 0, 0], [15, 490, 10, 5, 0], [0, 0, 0, 0, 0]],
      [[15, 525, 20, 0, 0], [0, 0, 0, 0, 0], [15, 490, 10, 5, 0]],
      [[15, 525, 20, 0, 0], [15, 490, 10, 5, 0], [2, 70, 0, 0, 0]],
    ],
    ...o,
  };
}

const evento = (tragitti: TragittoSimulato[]): EventoSimulato => ({ id: 'e1', artista: 'Stadio', citta: 'Roma', data: '2026-10-27T00:00:00.000Z', anno: 2026, tragitti });

describe('conti di un tragitto', () => {
  it('di serie parte la proposta e non il bus sotto il pareggio: chi resta fuori è a terra', () => {
    const c = contiTragitto(tragitto(), {});
    expect(c.voce).toMatchObject({ passeggeri: 30, incasso: 1015, promoter: 30, whiteLabel: 5, costoBus: 1150, bus: 2 });
    expect(spesa(c.voce)).toBe(1185);
    expect(risultato(c.voce)).toBe(-170);
    // A terra i 2 che porterebbe il bus 3, con le loro prenotazioni da 70 €.
    expect(c.aTerra).toEqual({ passeggeri: 2, valore: 70 });
  });

  it('chi ha un rimborso in attesa non è contato a terra', () => {
    expect(contiTragitto(tragitto({ passeggeri: 35, inAttesaDiRimborso: 3 }), {}).aTerra).toEqual({ passeggeri: 2, valore: 70 });
  });

  it('per linea e per bus; un bus spento mostra cosa porterebbe partendo', () => {
    const [linea] = contiTragitto(tragitto(), {}).linee;
    expect(linea.bus.map((r) => [r.bus.nome, r.parte, r.voce.passeggeri, r.voce.incasso, spesa(r.voce)])).toEqual([
      ['Bus 1', true, 15, 525, 570],
      ['Bus 2', true, 15, 490, 615],
      ['Bus 3', false, 2, 70, 600],
    ]);
    // La linea somma solo i bus che partono.
    expect(linea.voce.incasso).toBe(1015);
  });

  it('accendendo il bus sotto il pareggio', () => {
    const c = contiTragitto(tragitto(), { B3: { parte: true } });
    expect(c.voce.passeggeri).toBe(32);
    expect(c.aTerra).toEqual({ passeggeri: 0, valore: 0 });
    expect(c.voce.costoBus).toBe(1750);
  });

  it('spento il bus 2, il bus 3 porta i suoi passeggeri', () => {
    const [linea] = contiTragitto(tragitto(), { B2: { parte: false }, B3: { parte: true } }).linee;
    expect(linea.bus.map((r) => r.voce.passeggeri)).toEqual([15, 15, 15]);
    expect(linea.bus[1].parte).toBe(false);
  });

  it('un costo scritto a mano vale al posto di preventivo e quotazione; senza costo conta 0 e si segnala', () => {
    expect(contiTragitto(tragitto(), { B2: { costo: 450 } }).voce.costoBus).toBe(1000);
    const senza = tragitto();
    senza.bus[1] = { ...senza.bus[1], costo: null, fonteCosto: null };
    expect(contiTragitto(senza, {}).voce).toMatchObject({ costoBus: 550, busSenzaCosto: 1 });
  });

  it('di un acconto conta solo quanto è stato pagato; i saldi che mancano sono a parte e non cambiano il risultato', () => {
    // Solo il bus confermato: 15 passeggeri, pagati 300 € di acconti su 525 €.
    const c = contiTragitto(tragitto({ bus: [bus({ chiave: 'B1' })], esiti: [[[15, 300, 20, 0, 225]]] }), {});
    expect(c.voce).toMatchObject({ incasso: 300, daIncassare: 225 });
    expect(risultato(c.voce)).toBe(300 - 550 - 20);
  });

  it('i passeggeri senza bus di un viaggio passato contano, ma non sono un bus', () => {
    const t = tragitto({
      bus: [bus({ chiave: 'x', nome: 'Passeggeri senza bus', tipo: 'senza-bus', costo: 0, fonteCosto: null, posti: 0 })],
      esiti: [[[10, 400, 0, 0, 0]]],
      passeggeri: 10,
    });
    expect(contiTragitto(t, {}).voce).toMatchObject({ passeggeri: 10, incasso: 400, bus: 0, busSenzaCosto: 0 });
  });
});

describe('evento e giudizio', () => {
  it('somma i tragitti', () => {
    const c = contiEvento(evento([tragitto(), tragitto({ id: 't2' })]), {});
    expect(risultato(c.voce)).toBe(-340);
    expect(c.aTerra).toEqual({ passeggeri: 4, valore: 140 });
  });

  it('guadagno, pareggio sotto l\'euro, perdita', () => {
    expect(giudizio(120)).toBe('guadagno');
    expect(giudizio(0.4)).toBe('pareggio');
    expect(giudizio(-0.6)).toBe('pareggio');
    expect(giudizio(-1)).toBe('perdita');
  });
});

describe('scelte', () => {
  it('tornata come di serie, la scelta sparisce; un costo scritto resta', () => {
    const b = tragitto().bus[2];
    const accesa = conScelta({}, b, { parte: true });
    expect(accesa).toEqual({ B3: { parte: true } });
    expect(conScelta(accesa, b, { parte: false })).toEqual({});
    expect(conScelta({}, b, { costo: 600 })).toEqual({ B3: { costo: 600 } });
    expect(conScelta({ B3: { costo: 500 } }, b, { costo: undefined })).toEqual({});
  });
});
