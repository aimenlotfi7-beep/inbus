import { describe, expect, it } from 'vitest';
import { calcolaProposte, type DatiProposte } from './linee-da-confermare.service.js';
import type { BusDaRiempire, GruppoPasseggeri } from '../prenotazioni/riempimento-bus.js';

// Proposte "da confermare" e contatore del pareggio (regole del proprietario,
// settembre 2026): si prova lo smistamento e conta chi resterebbe senza posto.

let n = 0;
const gruppo = (citta: string, passeggeri: number, extra: Partial<GruppoPasseggeri> = {}): GruppoPasseggeri =>
  ({ id: `g${++n}`, fermataCitta: citta, passeggeri, eta: 30, creataIl: new Date(Date.UTC(2026, 8, 1, 0, n)), busId: null, ...extra });
/** Tanti gruppi da una persona: il vecchio conto a numeri. */
const persone = (citta: string, quante: number) => Array.from({ length: quante }, () => gruppo(citta, 1));

const roma = { id: 'roma', citta: 'Roma' };
const firenze = { id: 'firenze', citta: 'Firenze' };
const bologna = { id: 'bologna', citta: 'Bologna' };
const fermate = [roma, firenze, bologna];
const busSu = (id: string, posti: number, citta: string[], primaFermata = 0): BusDaRiempire => ({ busId: id, postiBus: posti, fermate: new Set(citta), primaFermata });

const base: DatiProposte = {
  gruppi: [], bus: [], busConfermati: 0, fermateOrdinate: fermate, fermateLineaPrincipale: fermate.map((f) => f.id),
  lineeConfermate: 0, postiPareggio: 30, postiPerBus: 50,
};
const calcola = (extra: Partial<DatiProposte>) => calcolaProposte({ ...base, ...extra });

describe('quando nasce una proposta (bus da 50, pareggio 30, gruppi da una persona)', () => {
  it('29 senza posto: nessuna; 30: la prima', () => {
    expect(calcola({ gruppi: persone('Roma', 29) }).proposte).toHaveLength(0);
    expect(calcola({ gruppi: persone('Roma', 30) }).proposte).toHaveLength(1);
  });

  it('79: sempre una; 80: la seconda; 130: la terza', () => {
    expect(calcola({ gruppi: persone('Roma', 79) }).proposte).toHaveLength(1);
    expect(calcola({ gruppi: persone('Roma', 80) }).proposte).toHaveLength(2);
    expect(calcola({ gruppi: persone('Roma', 130) }).proposte).toHaveLength(3);
  });

  it('con un bus vero da 54 già confermato la seconda nasce a 84', () => {
    const conBus = { bus: [busSu('b1', 54, ['Roma', 'Firenze', 'Bologna'])], busConfermati: 1, lineeConfermate: 1 };
    expect(calcola({ ...conBus, gruppi: persone('Roma', 83) }).proposte).toHaveLength(0);
    expect(calcola({ ...conBus, gruppi: persone('Roma', 84) }).proposte).toHaveLength(1);
  });

  it('senza quotazione non si propone nulla', () => {
    expect(calcola({ postiPareggio: null, gruppi: persone('Roma', 200) })).toEqual({ proposte: [], contatore: null });
  });

  it('un gruppo più grande di un bus non fa nascere proposte all\'infinito', () => {
    expect(calcola({ postiPareggio: 9, postiPerBus: 15, gruppi: [gruppo('Roma', 18)] }).proposte).toHaveLength(0);
  });
});

describe('i gruppi non si dividono', () => {
  // Il caso reale di produzione (settembre 2026): Linea 1 Como-Saronno con 3 bus
  // da 15, Linea 2 da Saronno con un bus da 15, gruppi già smistati; restano
  // senza posto due gruppi da 7 di Como.
  const como = { id: 'como', citta: 'Como' };
  const saronno = { id: 'saronno', citta: 'Saronno' };
  const linea1 = ['Como', 'Saronno'];
  const ultimo: DatiProposte = {
    gruppi: [
      gruppo('Como', 9, { busId: 'l1b1' }), gruppo('Como', 9, { busId: 'l1b2' }), gruppo('Como', 9, { busId: 'l1b3' }), gruppo('Como', 4, { busId: 'l1b1' }),
      gruppo('Saronno', 4, { busId: 'l1b2' }), gruppo('Saronno', 7, { busId: 'l2b1' }), gruppo('Como', 7), gruppo('Como', 7),
    ],
    bus: [busSu('l1b1', 15, linea1), busSu('l1b2', 15, linea1), busSu('l1b3', 15, linea1), busSu('l2b1', 15, ['Saronno'], 1)],
    busConfermati: 4,
    fermateOrdinate: [como, saronno],
    fermateLineaPrincipale: ['como', 'saronno'],
    lineeConfermate: 2,
    postiPareggio: 9,
    postiPerBus: 15,
  };

  it('«Ultimo», Como → Roma: 14 di Como senza posto → Bus in più sulla Linea 1, non una linea nuova', () => {
    const { proposte, contatore } = calcolaProposte(ultimo);
    expect(proposte).toEqual([{ tipo: 'bus', fermateIds: ['como', 'saronno'] }]);
    // Con il bus in più entrano tutti: il contatore riparte per il 6°.
    expect(contatore).toEqual({ bus: 6, contati: 0, pareggio: 9 });
  });

  it('i posti liberi non bastano se i gruppi non ci entrano: 56 passeggeri su 60 posti e 14 senza posto', () => {
    const { contatore } = calcolaProposte({ ...ultimo, postiPareggio: 15 });
    expect(contatore).toEqual({ bus: 5, contati: 14, pareggio: 15 });
  });
});

describe('bus in più o linea nuova', () => {
  const lineaIntera = { bus: [busSu('b1', 50, ['Roma', 'Firenze', 'Bologna'])], busConfermati: 1, lineeConfermate: 1 };

  it('la prima proposta di un tragitto senza linee è il primo bus su tutte le fermate', () => {
    expect(calcola({ gruppi: [...persone('Roma', 2), ...persone('Bologna', 28)] }).proposte)
      .toEqual([{ tipo: 'bus', fermateIds: ['roma', 'firenze', 'bologna'] }]);
  });

  it('una linea nuova solo se tutti quelli senza posto salgono dopo le prime fermate', () => {
    // Roma e Firenze sui primi posti, i 40 di Bologna senza posto: linea da Bologna.
    const gruppi = [...persone('Roma', 30), ...persone('Firenze', 15), ...persone('Bologna', 45)].map((g, i) => ({ ...g, eta: 90 - i }));
    expect(calcola({ ...lineaIntera, gruppi }).proposte[0]).toEqual({ tipo: 'linea', fermateIds: ['bologna'] });
  });

  it('se anche uno solo della prima fermata resta senza posto, un bus in più sulla linea', () => {
    const gruppi = [...persone('Bologna', 45), ...persone('Roma', 45)].map((g, i) => ({ ...g, eta: 90 - i }));
    expect(calcola({ ...lineaIntera, gruppi }).proposte[0]).toEqual({ tipo: 'bus', fermateIds: ['roma', 'firenze', 'bologna'] });
  });
});

describe('contatore del pareggio', () => {
  it('prima di ogni bus conta per il 1°', () => {
    expect(calcola({ gruppi: persone('Roma', 12) }).contatore).toEqual({ bus: 1, contati: 12, pareggio: 30 });
  });

  it('al pareggio nasce la proposta e riparte da 0 per il 2°, finché i posti non finiscono', () => {
    expect(calcola({ gruppi: persone('Roma', 30) }).contatore).toEqual({ bus: 2, contati: 0, pareggio: 30 });
    expect(calcola({ gruppi: persone('Roma', 50) }).contatore).toEqual({ bus: 2, contati: 0, pareggio: 30 });
    expect(calcola({ gruppi: persone('Roma', 62) }).contatore).toEqual({ bus: 2, contati: 12, pareggio: 30 });
    expect(calcola({ gruppi: persone('Roma', 80) }).contatore).toEqual({ bus: 3, contati: 0, pareggio: 30 });
  });

  it('chi ha già un bus resta dov\'è', () => {
    const gruppi = [gruppo('Roma', 10, { busId: 'b1' }), ...persone('Roma', 45)];
    expect(calcola({ bus: [busSu('b1', 50, ['Roma', 'Firenze', 'Bologna'])], busConfermati: 1, lineeConfermate: 1, gruppi }).contatore)
      .toEqual({ bus: 2, contati: 5, pareggio: 30 });
  });
});
