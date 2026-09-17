import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, linee, prenotazioni, preventiviRichieste, preventiviRisposte, richiesteRimborso, tragitti } from '../../db/schema.js';
import { giornoARoma } from '../../shared/formato.js';
import { lineeDaConfermareService } from '../eventi/linee-da-confermare.service.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { simulazioneBusService } from './simulazione-bus.service.js';
import { creaCliente, creaFornitore, creaLineaConBus, fraGiorni, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Simulazione dei bus in più (proprietario, settembre 2026): chi non parte è
// rimborsato e non conta; costo dal preventivo più basso, altrimenti dalla
// quotazione; eventi passati con i numeri veri.

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('credito_per_passeggero', 0);
  await impostazione('soglia_occupazione_pareggio', 60);
});

async function prenota(s: Awaited<ReturnType<typeof scenarioBase>>, fermataId: string, passeggeri: number) {
  const cliente = await creaCliente();
  return prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId }, cliente, { passeggeri }), cliente.id);
}

/** Un bus da 4 posti (250 €) su Roma e Firenze; Roma 2 + 2 passeggeri da 40 €, Firenze 3 da 30 €. */
async function eventoInVendita() {
  const s = await scenarioBase({ tragitto: { preventivoPostiBus: 4, preventivoCosto: '300' } });
  const { bus } = await creaLineaConBus(s.tragitto.id, [s.roma.id, s.firenze.id], 4);
  await db.update(busFisici).set({ costo: '250' }).where(eq(busFisici.id, bus.id));
  const romaA = await prenota(s, s.roma.id, 2);
  const romaB = await prenota(s, s.roma.id, 2);
  await prenota(s, s.firenze.id, 3);
  await lineeDaConfermareService.allinea(s.tragitto.id);
  return { ...s, romaA, romaB };
}

describe('evento in vendita', () => {
  it('la proposta è un bus in più con il costo della quotazione; chi non parte non conta', async () => {
    const s = await eventoInVendita();
    const [proposta] = await db.select().from(linee).where(and(eq(linee.tragittoId, s.tragitto.id), eq(linee.daConfermare, true)));
    expect(proposta).toBeDefined();

    const evento = await simulazioneBusService.evento(s.evento.id);
    const [t] = evento!.tragitti;
    expect(t).toMatchObject({ passeggeri: 7, incasso: 250, daIncassare: 0 });
    expect(t.linee.map((l) => [l.nome, l.fermate])).toEqual([['Linea 1', ['Roma', 'Firenze']], [proposta.nome, ['Firenze']]]);
    expect(t.bus.map((b) => [b.nome, b.tipo, b.linea, b.interruttore, b.costo, b.fonteCosto])).toEqual([
      ['Bus 1', 'confermato', 0, null, 250, 'bus'],
      ['Bus 1', 'proposta', 1, 0, 300, 'quotazione'],
    ]);
    // Spento: partono i 4 di Roma (160 €) e i 3 di Firenze sono rimborsati. Acceso: i 3 di Firenze sul bus in più.
    expect(t.esiti).toEqual([[[4, 160, 0, 0, 0], [0, 0, 0, 0, 0]], [[4, 160, 0, 0, 0], [3, 90, 0, 0, 0]]]);
  });

  it('con un preventivo per quel bus vale il più basso', async () => {
    const s = await eventoInVendita();
    const [proposta] = await db.select().from(linee).where(and(eq(linee.tragittoId, s.tragitto.id), eq(linee.daConfermare, true)));
    for (const [n, prezzo] of [[1, '280'], [2, '220']] as const) {
      const fornitore = await creaFornitore();
      const [richiesta] = await db.insert(preventiviRichieste).values({
        tragittoId: s.tragitto.id, fornitoreId: fornitore.id, token: `token-simulazione-${n}`, tipoInvio: 'MANUALE', scopo: 'BUS', lineaId: proposta.id,
      }).returning();
      await db.insert(preventiviRisposte).values({ richiestaId: richiesta.id, prezzo, postiBus: 4 });
    }
    const [t] = (await simulazioneBusService.evento(s.evento.id))!.tragitti;
    expect(t.bus[1]).toMatchObject({ costo: 220, fonteCosto: 'preventivo', preventivi: 2 });
  });

  it('una richiesta di rimborso in attesa tiene il posto ma non conta', async () => {
    const s = await eventoInVendita();
    await db.insert(richiesteRimborso).values({ prenotazioneId: s.romaB.id });
    const [t] = (await simulazioneBusService.evento(s.evento.id))!.tragitti;
    expect(t.inAttesaDiRimborso).toBe(2);
    expect(t.esiti[0][0]).toEqual([2, 80, 0, 0, 0]);
  });

  it('di un acconto conta solo quanto è stato pagato; il saldo che manca è a parte', async () => {
    const s = await scenarioBase({ tragitto: { preventivoPostiBus: 50, preventivoCosto: '500' } });
    await creaLineaConBus(s.tragitto.id, [s.roma.id, s.firenze.id], 50);
    const cliente = await creaCliente();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, cliente, { passeggeri: 2, tipoPagamento: 'ACCONTO' }), cliente.id);
    const [salvata] = await db.select({ totale: prenotazioni.totale }).from(prenotazioni).where(eq(prenotazioni.id, p.id));
    const acconto = Number(salvata.totale);
    // 2 posti da 40 €: l'acconto è meno degli 80 € del prezzo intero.
    expect(acconto).toBeLessThan(80);
    const [t] = (await simulazioneBusService.evento(s.evento.id))!.tragitti;
    expect(t).toMatchObject({ incasso: acconto, daIncassare: 80 - acconto });
    expect(t.esiti[0][0]).toEqual([2, acconto, 0, 0, 80 - acconto]);
  });

  it('un evento passato non ha niente da simulare', async () => {
    const s = await eventoInVendita();
    await db.update(eventi).set({ data: fraGiorni(-3) }).where(eq(eventi.id, s.evento.id));
    expect(await simulazioneBusService.evento(s.evento.id)).toBeNull();
  });
});

describe('anno', () => {
  it('eventi passati con i numeri veri e in vendita simulati', async () => {
    // Passato: un bus da 50 senza costo (vale la quotazione, 500 €); 2 sul bus, 1 rimasto a terra.
    const passato = await scenarioBase({ tragitto: { preventivoPostiBus: 50, preventivoCosto: '500' } });
    const { bus } = await creaLineaConBus(passato.tragitto.id, [passato.roma.id, passato.firenze.id], 50);
    const salito = await prenota(passato, passato.roma.id, 2);
    await prenota(passato, passato.roma.id, 1);
    await db.update(prenotazioni).set({ busId: bus.id }).where(eq(prenotazioni.id, salito.id));
    const data = fraGiorni(-5);
    await db.update(eventi).set({ data }).where(eq(eventi.id, passato.evento.id));
    await db.update(tragitti).set({ stato: 'CONFERMATO' }).where(eq(tragitti.id, passato.tragitto.id));

    const inVendita = await eventoInVendita();
    const anno = giornoARoma(data).anno;
    const risultato = await simulazioneBusService.anno(anno);

    expect(risultato.conclusi.map((e) => e.id)).toEqual([passato.evento.id]);
    const [t] = risultato.conclusi[0].tragitti;
    expect(t.passeggeri).toBe(3);
    expect(t.bus.map((b) => [b.nome, b.costo, b.fonteCosto])).toEqual([['Bus 1', 500, 'quotazione']]);
    // Sul bus i 2 saliti (80 €); quello rimasto a terra non conta.
    expect(t.esiti).toEqual([[[2, 80, 0, 0, 0]]]);
    expect(risultato.inVendita.map((e) => e.id)).toEqual([inVendita.evento.id]);
    expect(risultato.anni).toContain(anno);
  });
});
