import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupon, prenotazioni, richiesteRimborso, tragitti, utenti } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { richiesteRimborsoService } from './richieste-rimborso.service.js';
import { creaCliente, creaCoupon, creaEvento, creaFermata, creaTragitto, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';
import { posta } from '../../../test/posta.js';

// Rimborsi: cosa torna indietro quando un rimborso è approvato, con il database vero.

const creditoDi = async (utenteId: string) => Number((await db.select().from(utenti).where(eq(utenti.id, utenteId)))[0].creditoDisponibile);
const usi = async (codice: string) => (await db.select().from(coupon).where(eq(coupon.codice, codice)))[0].usiAttuali;
const statoDi = async (pnr: string) => (await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)))[0].stato;

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('credito_per_passeggero', 0);
});

describe('rimborso approvato', () => {
  it('prenotazione cancellata, posti restituiti e cliente avvisato', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 2 }), s.cliente.id);
    const richiesta = await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email, 'Non posso venire');
    posta.length = 0;

    const { clienteAvvisato } = await richiesteRimborsoService.approva(richiesta.id);
    expect(await statoDi(p.pnr)).toBe('CANCELLATA');
    expect((await db.select().from(tragitti).where(eq(tragitti.id, s.tragitto.id)))[0].postiDisponibili).toBe(999999);
    expect(clienteAvvisato).toBe(true);
    expect(posta.filter((e) => e.a === s.cliente.email)).toHaveLength(1);
  });

  it('il credito usato sulla prenotazione torna al cliente, quello maturato con il viaggio si toglie', async () => {
    await impostazione('credito_per_passeggero', 2);
    const s = await scenarioBase();
    await db.update(utenti).set({ creditoDisponibile: '20' }).where(eq(utenti.id, s.cliente.id));
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { usaCredito: true }), s.cliente.id);
    // 20 usati sulla prenotazione, 2 maturati con il pagamento completo.
    expect(await creditoDi(s.cliente.id)).toBe(2);

    const richiesta = await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);
    await richiesteRimborsoService.approva(richiesta.id);
    expect(await creditoDi(s.cliente.id)).toBe(20);
  });

  it('l\'uso del coupon torna disponibile', async () => {
    const s = await scenarioBase();
    await creaCoupon({ codice: 'FISSO5', tipo: 'FISSO', valore: '5', usiMax: 1 });
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { couponCodice: 'FISSO5' }), s.cliente.id);
    expect(await usi('FISSO5')).toBe(1);

    const richiesta = await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);
    await richiesteRimborsoService.approva(richiesta.id);
    expect(await usi('FISSO5')).toBe(0);
  });

  it('carrello con lo stesso coupon su due righe: l\'uso torna solo quando nessuna riga lo usa più', async () => {
    const cliente = await creaCliente();
    const evento = await creaEvento();
    const tragitto = await creaTragitto(evento.id);
    const roma = await creaFermata(tragitto.id, { citta: 'Roma', prezzo: '40' });
    const firenze = await creaFermata(tragitto.id, { citta: 'Firenze', prezzo: '30' });
    await creaCoupon({ codice: 'PERC10', tipo: 'PERCENTUALE', valore: '10' });
    const { prenotazioni: righe } = await prenotazioniService.creaOrdine([
      riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente, { couponCodice: 'PERC10' }),
      riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: firenze.id }, cliente, { couponCodice: 'PERC10' }),
    ], cliente.id);
    expect(await usi('PERC10')).toBe(1);

    const prima = await richiesteRimborsoService.richiedi(righe[0].pnr, cliente.email);
    await richiesteRimborsoService.approva(prima.id);
    expect(await usi('PERC10')).toBe(1);

    const seconda = await richiesteRimborsoService.richiedi(righe[1].pnr, cliente.email);
    await richiesteRimborsoService.approva(seconda.id);
    expect(await usi('PERC10')).toBe(0);
  });

  it('doppio clic su "Approva": la seconda volta è rifiutata e nulla viene restituito due volte', async () => {
    const s = await scenarioBase();
    await db.update(utenti).set({ creditoDisponibile: '10' }).where(eq(utenti.id, s.cliente.id));
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { usaCredito: true }), s.cliente.id);
    const richiesta = await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);

    const esiti = await Promise.allSettled([richiesteRimborsoService.approva(richiesta.id), richiesteRimborsoService.approva(richiesta.id)]);
    expect(esiti.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(esiti.find((e) => e.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    expect(await creditoDi(s.cliente.id)).toBe(10);
  });
});

describe('richiesta e rifiuto', () => {
  it('rifiutata: la prenotazione resta valida', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);
    const richiesta = await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);

    await richiesteRimborsoService.rifiuta(richiesta.id, 'Fuori tempo');
    expect(await statoDi(p.pnr)).toBe('CONFERMATA');
    expect((await db.select().from(richiesteRimborso).where(eq(richiesteRimborso.id, richiesta.id)))[0].stato).toBe('RIFIUTATA');
  });

  it('con un\'email diversa da quella della prenotazione la richiesta non parte', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);
    await expect(richiesteRimborsoService.richiedi(p.pnr, 'altra.persona@example.com')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('una sola richiesta in attesa per prenotazione', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);
    await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);
    await expect(richiesteRimborsoService.richiedi(p.pnr, s.cliente.email)).rejects.toMatchObject({ statusCode: 409 });
  });
});
