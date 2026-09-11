import { describe, expect, it } from 'vitest';
import {
  commissioniPer, costiMancanti, costoCompleto, economiaEventi, lineeEventi, sottoPareggio,
  type ContestoFonti, type DatiEventi, type PrenotazioneStatistica, type StruttureEventi,
} from './economia.js';

let contatore = 0;
function prenotazione(dati: Partial<PrenotazioneStatistica>): PrenotazioneStatistica {
  contatore += 1;
  return {
    id: `p${contatore}`, eventoId: 'e1', tragittoId: 't1', fermataCitta: 'Bologna', busId: null, utenteId: `u${contatore}`,
    passeggeri: 1, totale: 50, pagato: 50, sconto: '0', scontoBundle: null, couponCodice: null, promoterCodice: null,
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
