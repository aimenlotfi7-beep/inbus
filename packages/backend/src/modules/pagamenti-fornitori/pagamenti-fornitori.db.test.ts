import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, pagamentiFornitore, speseFornitore } from '../../db/schema.js';
import { pagamentiFornitoriService } from './pagamenti-fornitori.service.js';
import { fornitoriService } from '../fornitori/fornitori.routes.js';
import { creaFornitore, creaLineaConBus, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Pagamenti ai fornitori (proprietario, settembre 2026): le spese dei
// bus confermati non devono nascere doppie né cambiare sotto ai piedi
// dopo che è arrivata la fattura, e non si può pagare più del dovuto.

beforeEach(svuotaDatabase);

/** Un bus confermato con fornitore e costo: la spesa nasce da qui. */
async function busConCosto(costo: string) {
  const { evento, tragitto, roma, firenze } = await scenarioBase();
  const fornitore = await creaFornitore();
  const { bus } = await creaLineaConBus(tragitto.id, [roma.id, firenze.id], 50);
  await db.update(busFisici).set({ fornitoreId: fornitore.id, costo }).where(eq(busFisici.id, bus.id));
  return { evento, bus, fornitore };
}

const unaSpesa = async () => (await db.select().from(speseFornitore))[0];

describe('spese che arrivano dai bus confermati', () => {
  it('nasce una spesa per bus, e due giri non la raddoppiano', async () => {
    const { bus, fornitore } = await busConCosto('1200.00');

    expect(await pagamentiFornitoriService.allineaDaiBus()).toEqual({ create: 1, allineate: 0 });
    expect(await pagamentiFornitoriService.allineaDaiBus()).toEqual({ create: 0, allineate: 0 });

    const spesa = await unaSpesa();
    expect(spesa.busId).toBe(bus.id);
    expect(spesa.fornitoreId).toBe(fornitore.id);
    expect(Number(spesa.importo)).toBe(1200);
    expect(spesa.origine).toBe('BUS');
  });

  it('due giri insieme (salvataggio del bus e schermata aperta) fanno una spesa sola', async () => {
    await busConCosto('900.00');
    await Promise.all([pagamentiFornitoriService.allineaDaiBus(), pagamentiFornitoriService.allineaDaiBus()]);
    expect((await db.select().from(speseFornitore)).length).toBe(1);
  });

  it('il costo cambiato in Partenze aggiorna la spesa finché non è stata toccata', async () => {
    const { bus } = await busConCosto('1000.00');
    await pagamentiFornitoriService.allineaDaiBus();

    await db.update(busFisici).set({ costo: '1150.00' }).where(eq(busFisici.id, bus.id));
    expect(await pagamentiFornitoriService.allineaDaiBus()).toEqual({ create: 0, allineate: 1 });
    expect(Number((await unaSpesa()).importo)).toBe(1150);
  });

  it('con la fattura registrata il costo del bus non tocca più la spesa', async () => {
    const { bus } = await busConCosto('1000.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();
    await pagamentiFornitoriService.aggiorna(spesa.id, { numeroFattura: '2026/145' });

    await db.update(busFisici).set({ costo: '1150.00' }).where(eq(busFisici.id, bus.id));
    expect(await pagamentiFornitoriService.allineaDaiBus()).toEqual({ create: 0, allineate: 0 });
    expect(Number((await unaSpesa()).importo)).toBe(1000);
  });

  it('con un pagamento registrato il costo del bus non tocca più la spesa', async () => {
    const { bus } = await busConCosto('1000.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();
    await pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 300, pagatoIl: new Date(), metodo: 'BONIFICO' });

    await db.update(busFisici).set({ costo: '1150.00' }).where(eq(busFisici.id, bus.id));
    expect(await pagamentiFornitoriService.allineaDaiBus()).toEqual({ create: 0, allineate: 0 });
    expect(Number((await unaSpesa()).importo)).toBe(1000);
  });
});

describe('registrare i pagamenti', () => {
  it('acconto e saldo: la spesa risulta pagata solo alla fine', async () => {
    await busConCosto('1000.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();

    await pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 400, pagatoIl: new Date(), metodo: 'BONIFICO' });
    let elenco = await pagamentiFornitoriService.elenco({});
    expect(elenco.spese[0].stato).toBe('PARZIALE');
    expect(elenco.spese[0].residuo).toBe(600);

    await pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 600, pagatoIl: new Date(), metodo: 'CONTANTI' });
    elenco = await pagamentiFornitoriService.elenco({});
    expect(elenco.spese[0].stato).toBe('PAGATA');
    expect(elenco.spese[0].residuo).toBe(0);
    expect(elenco.riepilogo.daPagare).toBe(0);
    expect(elenco.riepilogo.pagato).toBe(1000);
  });

  it('non si può pagare più del dovuto, nemmeno con due registrazioni insieme', async () => {
    await busConCosto('1000.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();

    await expect(pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 1500, pagatoIl: new Date(), metodo: 'BONIFICO' }))
      .rejects.toThrow(/Restano da pagare/);

    const esiti = await Promise.allSettled([
      pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 1000, pagatoIl: new Date(), metodo: 'BONIFICO' }),
      pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 1000, pagatoIl: new Date(), metodo: 'BONIFICO' }),
    ]);
    expect(esiti.filter((e) => e.status === 'fulfilled').length).toBe(1);
    const pagamenti = await db.select().from(pagamentiFornitore).where(eq(pagamentiFornitore.spesaId, spesa.id));
    expect(pagamenti.reduce((t, p) => t + Number(p.importo), 0)).toBe(1000);
  });

  it("l'importo della spesa non può scendere sotto quanto è già stato pagato", async () => {
    await busConCosto('1000.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();
    await pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 700, pagatoIl: new Date(), metodo: 'BONIFICO' });

    await expect(pagamentiFornitoriService.aggiorna(spesa.id, { importo: 500 })).rejects.toThrow(/pagamenti per 700/);
    await pagamentiFornitoriService.aggiorna(spesa.id, { importo: 800 });
    expect(Number((await unaSpesa()).importo)).toBe(800);
  });

  it('un pagamento tolto rimette i soldi tra quelli da pagare', async () => {
    await busConCosto('500.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();
    const pagamento = await pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 500, pagatoIl: new Date(), metodo: 'BONIFICO' });
    expect((await pagamentiFornitoriService.elenco({})).spese[0].stato).toBe('PAGATA');

    await pagamentiFornitoriService.eliminaPagamento(pagamento.id);
    expect((await pagamentiFornitoriService.elenco({})).spese[0].stato).toBe('DA_PAGARE');
  });

  it('una spesa annullata non si paga e non conta nei totali', async () => {
    await busConCosto('500.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();
    await pagamentiFornitoriService.aggiorna(spesa.id, { annullata: true });

    await expect(pagamentiFornitoriService.registraPagamento(spesa.id, { importo: 100, pagatoIl: new Date(), metodo: 'BONIFICO' }))
      .rejects.toThrow(/annullata/);
    expect((await pagamentiFornitoriService.elenco({})).riepilogo.daPagare).toBe(0);
  });
});

describe('spese aggiunte a mano ed eliminazioni', () => {
  it('una spesa a mano si crea e si elimina finché non ha pagamenti', async () => {
    const fornitore = await creaFornitore();
    const spesa = await pagamentiFornitoriService.crea({ fornitoreId: fornitore.id, descrizione: 'Pedaggi', importo: 80 });
    await pagamentiFornitoriService.elimina(spesa.id);
    expect((await db.select().from(speseFornitore)).length).toBe(0);

    const altra = await pagamentiFornitoriService.crea({ fornitoreId: fornitore.id, descrizione: 'Parcheggio', importo: 50 });
    await pagamentiFornitoriService.registraPagamento(altra.id, { importo: 50, pagatoIl: new Date(), metodo: 'CONTANTI' });
    await expect(pagamentiFornitoriService.elimina(altra.id)).rejects.toThrow(/annulla/i);
  });

  it('una spesa nata da un bus non si elimina: si annulla', async () => {
    await busConCosto('300.00');
    await pagamentiFornitoriService.allineaDaiBus();
    const spesa = await unaSpesa();
    await expect(pagamentiFornitoriService.elimina(spesa.id)).rejects.toThrow(/bus confermato/);
  });

  it('un fornitore con spese registrate non si può eliminare', async () => {
    const fornitore = await creaFornitore();
    await pagamentiFornitoriService.crea({ fornitoreId: fornitore.id, descrizione: 'Extra', importo: 100 });
    await expect(fornitoriService.remove(fornitore.id)).rejects.toThrow(/Non si può eliminare/);
  });
});

describe('filtri ed elenco', () => {
  it('il riepilogo resta su tutte le spese anche filtrando per stato', async () => {
    const fornitore = await creaFornitore();
    const pagata = await pagamentiFornitoriService.crea({ fornitoreId: fornitore.id, descrizione: 'Pagata', importo: 100 });
    await pagamentiFornitoriService.crea({ fornitoreId: fornitore.id, descrizione: 'Da pagare', importo: 200 });
    await pagamentiFornitoriService.registraPagamento(pagata.id, { importo: 100, pagatoIl: new Date(), metodo: 'CARTA' });

    const soloDaPagare = await pagamentiFornitoriService.elenco({ stato: 'DA_PAGARE' });
    expect(soloDaPagare.spese.map((s) => s.descrizione)).toEqual(['Da pagare']);
    expect(soloDaPagare.riepilogo.totale).toBe(300);
    expect(soloDaPagare.riepilogo.daPagare).toBe(200);
  });

  it('il filtro per fornitore lascia fuori gli altri', async () => {
    const uno = await creaFornitore();
    const due = await creaFornitore();
    await pagamentiFornitoriService.crea({ fornitoreId: uno.id, descrizione: 'Uno', importo: 10 });
    await pagamentiFornitoriService.crea({ fornitoreId: due.id, descrizione: 'Due', importo: 20 });

    const elenco = await pagamentiFornitoriService.elenco({ fornitoreId: due.id });
    expect(elenco.spese.map((s) => s.descrizione)).toEqual(['Due']);
    expect(elenco.riepilogo.totale).toBe(20);
  });
});
