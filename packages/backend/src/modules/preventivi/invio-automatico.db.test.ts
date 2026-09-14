import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { logAttivita, preventiviRichieste, prenotazioni, tragitti } from '../../db/schema.js';
import { invioAutomaticoService } from './invio-automatico.service.js';
import { lineeDaConfermareService } from '../eventi/linee-da-confermare.service.js';
import { creaCliente, creaEvento, creaFermata, creaFornitore, creaProposta, creaTragitto, fraGiorni, svuotaDatabase } from '../../../test/dati.js';
import { posta } from '../../../test/posta.js';

// Richieste ai fornitori che partono da sole, senza clic (deciso dal
// proprietario, settembre 2026).

const ROMA = { lat: 41.9, lng: 12.5 };

async function fornitori() {
  return {
    automatico: await creaFornitore({ nome: 'Bus Roma', lat: 41.91, lng: 12.49, invioAutomatico: true }),
    manuale: await creaFornitore({ nome: 'Viaggi Tivoli', lat: 41.96, lng: 12.8 }),
    lontano: await creaFornitore({ nome: 'Autolinee Milano', lat: 45.46, lng: 9.19, invioAutomatico: true }),
  };
}

/** Evento in programma con un tragitto e la fermata di Roma (con coordinate e orario). */
async function tragittoConOrari(o: { evento?: Parameters<typeof creaEvento>[0]; tragitto?: Parameters<typeof creaTragitto>[1]; orario?: string | null } = {}) {
  const evento = await creaEvento(o.evento);
  const tragitto = await creaTragitto(evento.id, { stato: 'DA_CONFERMARE', ...o.tragitto });
  const roma = await creaFermata(tragitto.id, { citta: 'Roma', ...ROMA, orario: o.orario === undefined ? '08:00' : o.orario, ordine: 0 });
  const firenze = await creaFermata(tragitto.id, { citta: 'Firenze', lat: 43.77, lng: 11.25, orario: o.orario === undefined ? '10:00' : o.orario, ordine: 1 });
  return { evento, tragitto, roma, firenze };
}

const richiesteDelTragitto = (tragittoId: string) => db.select().from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, tragittoId));

beforeEach(svuotaDatabase);

describe('quotazione che parte da sola', () => {
  it('appena il tragitto ha gli orari: ai fornitori con "Invio automatico" nel raggio, una volta sola', async () => {
    const f = await fornitori();
    const t = await tragittoConOrari();

    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBe('quotazione');
    const richieste = await richiesteDelTragitto(t.tragitto.id);
    expect(richieste.map((r) => r.fornitoreId)).toEqual([f.automatico.id]);
    expect(richieste[0]).toMatchObject({ scopo: 'QUOTAZIONE', tipoInvio: 'AUTOMATICO', perCambioPercorso: false });
    expect(posta.map((e) => e.a)).toEqual([f.automatico.email]);
    const [salvato] = await db.select().from(tragitti).where(eq(tragitti.id, t.tragitto.id));
    expect(salvato.partenzaLat).toBe(ROMA.lat);
    const registro = await db.select().from(logAttivita).where(eq(logAttivita.azione, 'Richiesta automatica ai fornitori'));
    expect(registro[0].dettaglio).toContain('Bus Roma');

    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBeNull();
    expect(await richiesteDelTragitto(t.tragitto.id)).toHaveLength(1);
  });

  it('senza orari non parte', async () => {
    await fornitori();
    const t = await tragittoConOrari({ orario: null });
    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBeNull();
    expect(await richiesteDelTragitto(t.tragitto.id)).toHaveLength(0);
  });

  it('evento in bozza o già passato: non parte', async () => {
    await fornitori();
    const bozza = await tragittoConOrari({ evento: { bozza: true } });
    const passato = await tragittoConOrari({ evento: { data: fraGiorni(-2) } });
    expect(await invioAutomaticoService.perTragitto(bozza.tragitto.id)).toBeNull();
    expect(await invioAutomaticoService.perTragitto(passato.tragitto.id)).toBeNull();
    expect(posta).toHaveLength(0);
  });

  it('nessun fornitore con "Invio automatico" nel raggio: non parte niente (resta da mandare a mano)', async () => {
    await creaFornitore({ nome: 'Viaggi Tivoli', lat: 41.96, lng: 12.8 });
    const t = await tragittoConOrari();
    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBeNull();
    expect(await richiesteDelTragitto(t.tragitto.id)).toHaveLength(0);
  });

  it('una quotazione già chiesta a mano: niente invio automatico in più', async () => {
    const f = await fornitori();
    const t = await tragittoConOrari();
    await db.insert(preventiviRichieste).values({ tragittoId: t.tragitto.id, fornitoreId: f.manuale.id, token: 'a-mano', tipoInvio: 'MANUALE' });
    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBeNull();
  });

  it('percorso cambiato dopo la quotazione: nuova richiesta a chi ha "Invio automatico" e a chi aveva dato la quotazione', async () => {
    const f = await fornitori();
    const t = await tragittoConOrari({
      tragitto: {
        stato: 'PREZZATO', preventivoCosto: '1000', preventivoPostiBus: 50, fornitoreId: f.lontano.id,
        fermatePreventivo: ['Roma', 'Napoli'], percorsoPreventivoIl: new Date(Date.now() - 3600_000),
      },
    });
    // Il fornitore automatico era già stato contattato per il percorso di prima.
    await db.insert(preventiviRichieste).values({ tragittoId: t.tragitto.id, fornitoreId: f.automatico.id, token: 'prima', tipoInvio: 'AUTOMATICO', creataIl: new Date(Date.now() - 7200_000) });

    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBe('cambio-percorso');
    const nuove = (await richiesteDelTragitto(t.tragitto.id)).filter((r) => r.perCambioPercorso);
    expect(nuove.map((r) => r.fornitoreId).sort()).toEqual([f.automatico.id, f.lontano.id].sort());
    expect(posta.every((e) => e.oggetto.startsWith('Percorso cambiato'))).toBe(true);

    expect(await invioAutomaticoService.perTragitto(t.tragitto.id)).toBeNull();
  });
});

describe('preventivi per il bus che partono da soli', () => {
  it('appena c\'è la proposta: ai fornitori con "Invio automatico" vicini e a chi ha dato la quotazione, una volta sola', async () => {
    const f = await fornitori();
    const t = await tragittoConOrari({ tragitto: { stato: 'PREZZATO', preventivoCosto: '1000', preventivoPostiBus: 50, fornitoreId: f.lontano.id } });
    const proposta = await creaProposta(t.tragitto.id, [t.roma.id, t.firenze.id]);

    expect(await invioAutomaticoService.perProposta(proposta.id)).toBe(true);
    const richieste = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.lineaId, proposta.id));
    expect(richieste.map((r) => r.fornitoreId).sort()).toEqual([f.automatico.id, f.lontano.id].sort());
    expect(richieste.every((r) => r.scopo === 'BUS' && r.tipoInvio === 'AUTOMATICO')).toBe(true);

    expect(await invioAutomaticoService.perProposta(proposta.id)).toBe(false);
  });

  it('quando le prenotazioni fanno nascere la proposta, i preventivi partono senza fare nulla', async () => {
    const f = await fornitori();
    const t = await tragittoConOrari({ tragitto: { stato: 'PREZZATO', preventivoCosto: '1000', preventivoPostiBus: 50 } });
    const cliente = await creaCliente();
    await db.insert(prenotazioni).values({ pnr: 'IBPAREGGIO01', eventoId: t.evento.id, tragittoId: t.tragitto.id, fermataCitta: 'Roma', passeggeri: 30, totale: '1200', utenteId: cliente.id });

    const { create } = await lineeDaConfermareService.allinea(t.tragitto.id);
    expect(create).toBe(1);
    await vi.waitFor(async () => {
      const richieste = await db.select().from(preventiviRichieste).where(and(eq(preventiviRichieste.tragittoId, t.tragitto.id), eq(preventiviRichieste.scopo, 'BUS')));
      expect(richieste.map((r) => r.fornitoreId)).toEqual([f.automatico.id]);
    }, { timeout: 10_000 });
  });
});

describe('giro di ogni ora', () => {
  it('manda anche quello che era già in attesa', async () => {
    const f = await fornitori();
    const conOrari = await tragittoConOrari();
    const inVendita = await tragittoConOrari({ tragitto: { stato: 'PREZZATO', preventivoCosto: '1000', preventivoPostiBus: 50, fornitoreId: f.lontano.id } });
    await creaProposta(inVendita.tragitto.id, [inVendita.roma.id]);

    expect(await invioAutomaticoService.tutti()).toEqual({ quotazioni: 1, bus: 1 });
    expect(await richiesteDelTragitto(conOrari.tragitto.id)).toHaveLength(1);
    expect(await invioAutomaticoService.tutti()).toEqual({ quotazioni: 0, bus: 0 });
  });
});
