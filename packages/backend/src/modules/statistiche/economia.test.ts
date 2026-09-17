import { describe, expect, it } from 'vitest';
import {
  commissioniPer, costiMancanti, costoCompleto, economiaEventi, lineeEventi, sottoPareggio, tragittiConclusi,
  type ContestoFonti, type DatiEventi, type PrenotazioneStatistica, type StruttureEventi,
} from './economia.js';

let contatore = 0;
function prenotazione(dati: Partial<PrenotazioneStatistica>): PrenotazioneStatistica {
  contatore += 1;
  return {
    id: `p${contatore}`, ordineId: null, eventoId: 'e1', tragittoId: 't1', fermataCitta: 'Bologna', busId: null, utenteId: `u${contatore}`,
    passeggeri: 1, totale: 50, pagato: 50, sconto: '0', scontoBundle: null, couponCodice: null, promoterCodice: null, compensoPromoter: null,
    canaleVendita: 'INBUS', whiteLabelId: null, quotaWhiteLabel: null, utmSource: null, utmMedium: null, utmCampaign: null,
    offertaId: null, tipoPagamento: 'COMPLETO', saldoPagato: true, scadenzaSaldo: null,
    creataIl: new Date('2026-09-01T10:00:00Z'), eventoData: new Date('2026-10-17T00:00:00Z'),
    ...dati,
  };
}

function contesto(): ContestoFonti {
  return {
    campagne: [],
    nomiPromoter: new Map(),
    idPromoter: new Map(),
    nomiPromoterPerId: new Map(),
    percentualiPromoter: new Map([['GIULIA', 10]]),
    nomiWhiteLabel: new Map(),
    coupon: new Map([['RADIO', { compensoTipo: 'FISSO', compensoValore: '3', compensoFissoPer: 'PASSEGGERO', promoterId: null }]]),
    campagnaDiOfferta: new Map(),
  };
}

function dati(righe: PrenotazioneStatistica[], strutture: StruttureEventi): DatiEventi {
  return { righe, strutture, ctx: contesto(), soglia: 50, postiPerBus: 50 };
}

describe('commissioniPer', () => {
  const righe = [
    prenotazione({ totale: 100, promoterCodice: 'GIULIA' }),
    prenotazione({ totale: 50, promoterCodice: 'GIULIA', canaleVendita: 'WHITE_LABEL', quotaWhiteLabel: '5.00' }),
    prenotazione({ totale: 80, passeggeri: 2, promoterCodice: 'GIULIA', couponCodice: 'RADIO' }),
    prenotazione({ totale: 70, promoterCodice: 'SCONOSCIUTO' }),
  ];
  it('percentuale del promoter, compenso del coupon e quota White Label', () => {
    expect(commissioniPer(righe, () => 'tutto', contesto()).get('tutto')).toBe(10 + 5 + 6 + 5);
  });
  it('senza le quote White Label quando serve solo il promoter', () => {
    expect(commissioniPer(righe, () => 'tutto', contesto(), { quoteWhiteLabel: false }).get('tutto')).toBe(21);
  });
  it('la regola fissata alla vendita vale al posto di percentuale e coupon di oggi, anche a promoter eliminato', () => {
    const regola = (percentuale: number, coupon: Partial<{ compensoTipo: 'FISSO' | 'PERCENTUALE'; compensoValore: number; compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' }> = {}) =>
      ({ percentuale, compensoTipo: null, compensoValore: null, compensoFissoPer: null, ...coupon });
    const conRegola = [
      prenotazione({ totale: 100, promoterCodice: 'GIULIA', compensoPromoter: regola(20) }), // oggi 10%: resta il 20% di allora
      prenotazione({ totale: 80, passeggeri: 2, promoterCodice: 'GIULIA', couponCodice: 'RADIO', compensoPromoter: regola(20, { compensoTipo: 'FISSO', compensoValore: 5, compensoFissoPer: 'PASSEGGERO' }) }),
      prenotazione({ totale: 50, promoterCodice: 'ELIMINATO', compensoPromoter: regola(10) }),
      prenotazione({ totale: 100, promoterCodice: 'GIULIA' }), // vendita vecchia senza regola: percentuale di oggi
    ];
    expect(commissioniPer(conRegola, () => 'tutto', contesto()).get('tutto')).toBe(20 + 10 + 5 + 10);
  });
});

describe('economiaEventi', () => {
  const strutture: StruttureEventi = {
    tragitti: [
      { id: 't1', eventoId: 'e1', nome: 'Bologna-Milano', attivo: true, preventivoPostiBus: 50 },
      { id: 't2', eventoId: 'e1', nome: 'Firenze-Milano', attivo: true, preventivoPostiBus: 50 },
    ],
    linee: [{ id: 'l1', nome: 'Linea 1', tragittoId: 't1', daConfermare: false }],
    fermateLinee: [{ lineaId: 'l1', citta: 'Bologna' }],
    bus: [{ id: 'b1', lineaId: 'l1', costo: '1000', postiBus: 50 }],
  };
  it('un tragitto con passeggeri e senza bus rende il costo incompleto', () => {
    const e = economiaEventi(['e1'], dati([
      prenotazione({ tragittoId: 't1', passeggeri: 30, totale: 1500 }),
      prenotazione({ tragittoId: 't2', fermataCitta: 'Firenze', passeggeri: 5, totale: 250 }),
    ], strutture)).get('e1')!;
    expect(e.passeggeri).toBe(35);
    expect(e.incasso).toBe(1750);
    expect(e.costoBus).toBe(1000);
    expect(e.margine).toBe(750);
    expect(e.postiSuiBus).toBe(50);
    expect(e.passeggeriConBus).toBe(30);
    expect(e.passeggeriSenzaBus).toBe(5);
    expect(costoCompleto(e)).toBe(false);
    expect(costiMancanti(e)).toBe(true);
  });
  it('tutti i bus con il costo: completo', () => {
    const e = economiaEventi(['e1'], dati([prenotazione({ tragittoId: 't1', passeggeri: 30, totale: 1500 })], strutture)).get('e1')!;
    expect(costoCompleto(e)).toBe(true);
    expect(costiMancanti(e)).toBe(false);
  });
});

describe('tragittiConclusi (eventi passati: chi non parte è rimborsato)', () => {
  const strutture: StruttureEventi = {
    tragitti: [
      { id: 't1', eventoId: 'e1', nome: 'Bologna-Milano', attivo: true, preventivoPostiBus: 50, preventivoCosto: '900' },
      { id: 't2', eventoId: 'e1', nome: 'Firenze-Milano', attivo: true, preventivoPostiBus: 50, preventivoCosto: null },
    ],
    linee: [
      { id: 'l1', nome: 'Linea 1', tragittoId: 't1', daConfermare: false },
      { id: 'l2', nome: 'Linea 1', tragittoId: 't2', daConfermare: false },
    ],
    fermateLinee: [{ lineaId: 'l1', citta: 'Bologna' }, { lineaId: 'l1', citta: 'Modena' }],
    bus: [
      { id: 'b1', lineaId: 'l1', costo: '1000', postiBus: 50 },
      { id: 'b2', lineaId: 'l1', costo: null, postiBus: 50 },
      { id: 'b3', lineaId: 'l2', costo: null, postiBus: 50 },
    ],
  };

  it('per bus conta solo chi ci è salito; senza bus o con un rimborso in attesa non conta', () => {
    const inAttesa = prenotazione({ tragittoId: 't1', busId: 'b1', passeggeri: 2, totale: 100, pagato: 100 });
    const [t1] = tragittiConclusi(['e1'], dati([
      prenotazione({ tragittoId: 't1', busId: 'b1', passeggeri: 40, totale: 2000, pagato: 2000, promoterCodice: 'GIULIA', quotaWhiteLabel: '15.00' }),
      // Un acconto: pagati 100 € su 250 €.
      prenotazione({ tragittoId: 't1', busId: 'b2', passeggeri: 5, totale: 250, pagato: 100, tipoPagamento: 'ACCONTO', saldoPagato: false }),
      prenotazione({ tragittoId: 't1', busId: null, passeggeri: 3, totale: 150, pagato: 150, promoterCodice: 'GIULIA' }),
      inAttesa,
    ], strutture), new Set([inAttesa.id])).get('e1')!;
    // Pagato davvero senza il rimborso in attesa: anche i 3 rimasti a terra (150 €).
    expect(t1).toMatchObject({ passeggeri: 50, inAttesaDiRimborso: 2, incasso: 2250 });
    expect(t1.linee).toEqual([{ chiave: 'linea:l1', nome: 'Linea 1', fermate: ['Bologna', 'Modena'] }]);
    // b2 senza costo vale la quotazione del suo tragitto.
    expect(t1.bus.map((b) => [b.nome, b.costo, b.fonteCosto])).toEqual([['Bus 1', 1000, 'bus'], ['Bus 2', 900, 'quotazione']]);
    // [passeggeri, incasso pagato, commissioni promoter (10%), quote White Label, saldi da incassare]
    expect(t1.esiti).toEqual([[[40, 2000, 200, 15, 0], [5, 100, 0, 0, 150]]]);
  });

  it('un bus senza costo né quotazione resta senza costo; un tragitto mai smistato conta tutti i prenotati', () => {
    const conclusi = tragittiConclusi(['e1'], dati([
      prenotazione({ tragittoId: 't2', fermataCitta: 'Firenze', passeggeri: 10, totale: 500, pagato: 500 }),
    ], strutture), new Set()).get('e1')!;
    const t2 = conclusi.find((t) => t.id === 't2')!;
    expect(t2.bus.map((b) => [b.nome, b.tipo, b.costo])).toEqual([['Bus 1', 'confermato', null], ['Passeggeri senza bus', 'senza-bus', 0]]);
    expect(t2.esiti).toEqual([[[0, 0, 0, 0, 0], [10, 500, 0, 0, 0]]]);
  });
});

describe('lineeEventi', () => {
  const strutture: StruttureEventi = {
    tragitti: [{ id: 't1', eventoId: 'e1', nome: 'Bologna-Milano', attivo: true, preventivoPostiBus: 50 }],
    linee: [
      { id: 'l1', nome: 'Linea 1', tragittoId: 't1', daConfermare: false },
      { id: 'l2', nome: 'Linea 2', tragittoId: 't1', daConfermare: true },
    ],
    fermateLinee: [
      { lineaId: 'l1', citta: 'Bologna' }, { lineaId: 'l1', citta: 'Modena' },
      { lineaId: 'l2', citta: 'Bologna' }, { lineaId: 'l2', citta: 'Modena' }, { lineaId: 'l2', citta: 'Firenze' },
    ],
    bus: [{ id: 'b1', lineaId: 'l1', costo: '1200', postiBus: 50 }],
  };
  const righe = [
    prenotazione({ fermataCitta: 'Bologna', passeggeri: 30, totale: 1200 }),
    prenotazione({ fermataCitta: 'Modena', passeggeri: 25, totale: 1000 }),
    prenotazione({ fermataCitta: 'Firenze', passeggeri: 5, totale: 200 }),
  ];

  it('la linea con bus conta le sue fermate, quella da confermare chi non ha posto', () => {
    const [l1, l2] = lineeEventi(dati(righe, strutture));
    expect(l1.passeggeri).toBe(55);
    expect(l1.postiPareggio).toBe(25);
    expect(l1.margine).toBe(2200 - 1200);
    expect(sottoPareggio(l1)).toBe(false);
    expect(l2.daConfermare).toBe(true);
    expect(l2.passeggeri).toBe(10);
    expect(l2.incasso).toBe(400);
    expect(l2.postiPareggio).toBeNull();
    expect(l2.margine).toBeNull();
  });

  it('senza passeggeri in eccesso la linea da confermare resta vuota', () => {
    const [, l2] = lineeEventi(dati(righe.slice(0, 1), strutture));
    expect(l2.passeggeri).toBe(0);
    expect(l2.incasso).toBe(0);
  });

  it('una linea confermata senza bus vale i posti del preventivo; una da confermare con un bus conta come confermata', () => {
    const [l1, l2] = lineeEventi(dati(righe, {
      ...strutture,
      bus: [{ id: 'b2', lineaId: 'l2', costo: null, postiBus: 30 }],
    }));
    expect(l1.posti).toBe(50);
    expect(l1.costo).toBeNull();
    expect(l1.postiPareggio).toBeNull();
    expect(l2.daConfermare).toBe(false);
    expect(l2.posti).toBe(30);
    expect(l2.passeggeri).toBe(60);
    expect(l2.costoCompleto).toBe(false);
  });
});
