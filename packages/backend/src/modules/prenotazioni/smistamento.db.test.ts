import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, fermate, prenotazioni } from '../../db/schema.js';
import { prenotazioniService } from './prenotazioni.service.js';
import { smistamentoService } from './smistamento.service.js';
import { creaCliente, creaEvento, creaFermata, creaLineaConBus, creaTragitto, fraGiorni, impostazione, riga, svuotaDatabase } from '../../../test/dati.js';
import { posta } from '../../../test/posta.js';
import { inizioGiornoRoma } from '../../shared/formato.js';

// Smistamento sui bus: per età, gruppi mai divisi, solo nelle 24 ore prima
// della partenza, biglietto con il bus solo a saldo pagato.

const ANNO_MS = 365.25 * 24 * 3600 * 1000;
const busDi = async (pnr: string) => (await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)))[0].busId;

/** Orario "HH:MM" di Roma di un istante. */
const orarioRoma = (istante: Date) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(istante);

/** Un tragitto con Roma e Firenze; la partenza da Roma è fra `ore` ore. */
async function tragittoInPartenza(ore = 6) {
  const partenza = new Date(Date.now() + ore * 3600 * 1000);
  const evento = await creaEvento({ data: inizioGiornoRoma(partenza) });
  const tragitto = await creaTragitto(evento.id);
  const roma = await creaFermata(tragitto.id, { citta: 'Roma', orario: orarioRoma(partenza), ordine: 0 });
  const firenze = await creaFermata(tragitto.id, { citta: 'Firenze', prezzo: '30', orario: orarioRoma(new Date(partenza.getTime() + 2 * 3600 * 1000)), ordine: 1 });
  return { evento, tragitto, roma, firenze };
}

/** Un cliente di `anni` anni prenota `passeggeri` posti. */
async function prenota(t: Awaited<ReturnType<typeof tragittoInPartenza>>, anni: number, passeggeri: number, extra: { fermataId?: string; tipoPagamento?: 'COMPLETO' | 'ACCONTO' } = {}) {
  const cliente = await creaCliente({ dataNascita: new Date(Date.now() - anni * ANNO_MS) });
  return prenotazioniService.crea(
    riga({ eventoId: t.evento.id, tragittoId: t.tragitto.id, fermataId: extra.fermataId ?? t.roma.id }, cliente, { passeggeri, tipoPagamento: extra.tipoPagamento }),
    cliente.id,
  );
}

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('credito_per_passeggero', 0);
});

describe('smistamento per età', () => {
  it('dal più grande al più giovane, nel primo bus con posto, senza mai dividere un gruppo', async () => {
    const t = await tragittoInPartenza();
    const giovane = await prenota(t, 20, 2);
    const anziano = await prenota(t, 60, 3);
    const medio = await prenota(t, 40, 2);
    const { bus: busA } = await creaLineaConBus(t.tragitto.id, [t.roma.id, t.firenze.id], 4, 'Linea 1');
    const { bus: busB } = await creaLineaConBus(t.tragitto.id, [t.roma.id, t.firenze.id], 4, 'Linea 2');

    await smistamentoService.esegui();
    // 60 anni (3 posti) nel bus A; 40 anni (2) non entra nell'unico posto
    // rimasto in A e va nel B; 20 anni (2) prende gli ultimi posti del B.
    expect(await busDi(anziano.pnr)).toBe(busA.id);
    expect(await busDi(medio.pnr)).toBe(busB.id);
    expect(await busDi(giovane.pnr)).toBe(busB.id);
  });

  it('un gruppo più grande di ogni bus resta senza bus', async () => {
    const t = await tragittoInPartenza();
    const gruppo = await prenota(t, 30, 5);
    await creaLineaConBus(t.tragitto.id, [t.roma.id], 4);

    const esito = await smistamentoService.esegui();
    expect(await busDi(gruppo.pnr)).toBeNull();
    expect(esito.senzaPosto).toBe(1);
  });

  it('una fermata che nessuna linea copre resta senza bus', async () => {
    const t = await tragittoInPartenza();
    const daFirenze = await prenota(t, 30, 1, { fermataId: t.firenze.id });
    await creaLineaConBus(t.tragitto.id, [t.roma.id], 50);

    await smistamentoService.esegui();
    expect(await busDi(daFirenze.pnr)).toBeNull();
  });

  it('una prenotazione cancellata non occupa posti', async () => {
    const t = await tragittoInPartenza();
    const cancellata = await prenota(t, 70, 4);
    await prenotazioniService.cancella(cancellata.pnr, 'Prova');
    const valida = await prenota(t, 20, 4);
    const { bus } = await creaLineaConBus(t.tragitto.id, [t.roma.id], 4);

    await smistamentoService.esegui();
    expect(await busDi(cancellata.pnr)).toBeNull();
    expect(await busDi(valida.pnr)).toBe(bus.id);
  });
});

describe('dopo la partenza', () => {
  it('chi è rimasto senza bus non viene più sistemato e conta come senza posto', async () => {
    const t = await tragittoInPartenza(6);
    const p = await prenota(t, 30, 4);
    // La partenza da Roma diventa di 3 ore fa (oltre le 2 ore di tolleranza).
    const passata = new Date(Date.now() - 3 * 3600 * 1000);
    await db.update(eventi).set({ data: inizioGiornoRoma(passata) }).where(eq(eventi.id, t.evento.id));
    await db.update(fermate).set({ orario: orarioRoma(passata) }).where(eq(fermate.id, t.roma.id));
    await creaLineaConBus(t.tragitto.id, [t.roma.id, t.firenze.id], 50);

    await smistamentoService.esegui();
    expect(await busDi(p.pnr)).toBeNull();
    const anteprima = await smistamentoService.anteprima(t.tragitto.id);
    expect(anteprima.senzaPosto).toMatchObject({ passeggeri: 4, fuoriTempo: 4 });
    expect(anteprima.linee[0].bus[0].passeggeri).toBe(0);
  });
});

describe('quando si smista', () => {
  it('a più di 24 ore dalla partenza nessuno riceve ancora il bus', async () => {
    const evento = await creaEvento({ data: fraGiorni(10) });
    const tragitto = await creaTragitto(evento.id);
    const roma = await creaFermata(tragitto.id, { citta: 'Roma' });
    await creaLineaConBus(tragitto.id, [roma.id], 50);
    const cliente = await creaCliente();
    const p = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente), cliente.id);

    await smistamentoService.esegui();
    expect(await busDi(p.pnr)).toBeNull();
  });

  it('chi prenota a meno di 24 ore dalla partenza riceve subito il bus e il biglietto', async () => {
    const t = await tragittoInPartenza();
    const { bus } = await creaLineaConBus(t.tragitto.id, [t.roma.id], 50);

    const p = await prenota(t, 30, 2);
    expect(await busDi(p.pnr)).toBe(bus.id);
    // Il biglietto parte in sottofondo: un PDF per passeggero.
    await vi.waitFor(() => {
      const biglietto = posta.find((e) => e.a === p.utenteEmail && (e.allegati ?? []).length > 0);
      expect(biglietto?.allegati).toHaveLength(2);
    }, { timeout: 10_000 });
  });
});

describe('biglietto con il bus', () => {
  it('parte a chi ha pagato tutto, non a chi ha pagato solo l\'acconto', async () => {
    const t = await tragittoInPartenza();
    const pagato = await prenota(t, 50, 1);
    await creaLineaConBus(t.tragitto.id, [t.roma.id], 50);
    // L'acconto a poche ore dall'evento non si può scegliere: lo si segna a mano.
    const cliente = await creaCliente({ dataNascita: new Date(Date.now() - 40 * ANNO_MS) });
    const [soloAcconto] = await db.insert(prenotazioni).values({
      pnr: 'IBACCONTO0001', eventoId: t.evento.id, tragittoId: t.tragitto.id, fermataCitta: 'Roma', fermataOrario: t.roma.orario,
      passeggeri: 1, totale: '10', totalePrevisto: '40', tipoPagamento: 'ACCONTO', saldoPagato: false, utenteId: cliente.id,
    }).returning();
    posta.length = 0;

    await smistamentoService.esegui();
    expect(await busDi(pagato.pnr)).not.toBeNull();
    expect(await busDi(soloAcconto.pnr)).not.toBeNull();
    const conPdf = posta.filter((e) => (e.allegati ?? []).length > 0);
    expect(conPdf.map((e) => e.a)).toEqual([pagato.utenteEmail]);
  });
});
