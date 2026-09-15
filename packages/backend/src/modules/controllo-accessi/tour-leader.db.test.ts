import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, partecipantiPrenotazione, prenotazioni, tourLeader } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { tourLeaderAuthService } from '../tour-leader-auth/tour-leader-auth.service.js';
import { tourLeaderService } from '../tourleader/tourleader.routes.js';
import { eventiService } from '../eventi/eventi.service.js';
import { controlloAccessiService } from './controllo-accessi.service.js';
import { creaLineaConBus, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Tour leader e scansione dei biglietti: senza saldo non si sale, un tour
// leader archiviato non entra e non si assegna, l'email non ha maiuscole.

beforeEach(svuotaDatabase);

async function creaTourLeader(o: Partial<typeof tourLeader.$inferInsert> = {}) {
  const [tl] = await db.insert(tourLeader).values({
    nome: 'Luca', cognome: 'Bianchi', email: 'luca@example.com', stato: 'ATTIVO', passwordHash: await bcrypt.hash('password-prova', 4), ...o,
  }).returning();
  return tl;
}

/** Una prenotazione già sul bus del tour leader, con il QR pronto. */
async function passeggeroSulBus(tipoPagamento: 'COMPLETO' | 'ACCONTO') {
  const s = await scenarioBase();
  const tl = await creaTourLeader();
  const { bus } = await creaLineaConBus(s.tragitto.id, [s.roma.id], 50);
  await db.update(busFisici).set({ tourLeaderId: tl.id }).where(eq(busFisici.id, bus.id));
  const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { tipoPagamento }), s.cliente.id);
  const [pren] = await db.update(prenotazioni).set({ busId: bus.id }).where(eq(prenotazioni.pnr, p.pnr)).returning();
  const [partecipante] = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.prenotazioneId, pren.id)).limit(1);
  const token = `token-${pren.id}`;
  await db.update(partecipantiPrenotazione).set({ ticketToken: token }).where(eq(partecipantiPrenotazione.id, partecipante.id));
  return { tl, bus, token, partecipanteId: partecipante.id };
}

describe('scansione del QR', () => {
  it('saldo pagato: valido, e alla seconda scansione già a bordo', async () => {
    const { tl, bus, token } = await passeggeroSulBus('COMPLETO');
    expect((await controlloAccessiService.scansiona(bus.id, tl.id, token)).esito).toBe('valido');
    expect((await controlloAccessiService.scansiona(bus.id, tl.id, token)).esito).toBe('gia_a_bordo');
  });

  it('solo acconto: "saldo da pagare" e non risulta salito', async () => {
    const { tl, bus, token, partecipanteId } = await passeggeroSulBus('ACCONTO');
    const esito = await controlloAccessiService.scansiona(bus.id, tl.id, token);
    expect(esito.esito).toBe('saldo_da_pagare');
    const [p] = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.id, partecipanteId));
    expect(p.ticketUtilizzatoIl).toBeNull();
  });
});

describe('tour leader archiviato', () => {
  it('non entra nella scansione, nemmeno con un accesso già fatto', async () => {
    const tl = await creaTourLeader();
    await expect(tourLeaderAuthService.login('luca@example.com', 'password-prova')).resolves.toMatchObject({ nome: 'Luca Bianchi' });
    await tourLeaderService.update(tl.id, { stato: 'ARCHIVIATO' });
    await expect(tourLeaderAuthService.login('luca@example.com', 'password-prova')).rejects.toMatchObject({ statusCode: 403 });
    await expect(tourLeaderAuthService.verificaAncoraAttivo(tl.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(tourLeaderAuthService.attivaAccesso(tl.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('non si assegna a un bus', async () => {
    const s = await scenarioBase();
    const { bus } = await creaLineaConBus(s.tragitto.id, [s.roma.id], 50);
    const tl = await creaTourLeader({ stato: 'ARCHIVIATO' });
    await expect(eventiService.aggiornaBusDiLinea(bus.id, { tourLeaderId: tl.id })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('email del tour leader', () => {
  it('una vecchia email con maiuscole entra lo stesso', async () => {
    await creaTourLeader({ email: 'Luca@Example.com' });
    await expect(tourLeaderAuthService.login('luca@example.com', 'password-prova')).resolves.toMatchObject({ nome: 'Luca Bianchi' });
  });

  it('non si possono avere due tour leader con la stessa email', async () => {
    await creaTourLeader({ email: 'luca@example.com' });
    await expect(tourLeaderService.creaAmministrativo({ nome: 'Altro', cognome: 'Luca', email: 'luca@example.com' })).rejects.toMatchObject({ statusCode: 409 });
  });
});
