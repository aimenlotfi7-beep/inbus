import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { creaApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { amministratori, eventoResponsabile, permessi, ruoli, ruoloPermessi } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { PERMESSI_COLLABORATORE } from '../auth/permessi.service.js';
import { creaAmministratore, creaCliente, creaLineaConBus, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Collaboratori con "solo gli eventi assegnati" (proprietario, settembre
// 2026): vedono e gestiscono solo il loro evento, qualunque strada provino,
// e il compenso entra nei conti dell'evento. Chiamando il server vero.

let server: Server;
let base = '';

beforeAll(async () => {
  server = creaApp().listen(0);
  await new Promise((pronto) => server.once('listening', pronto));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((chiuso) => {
  server.close(() => chiuso());
  server.closeAllConnections();
}));
beforeEach(svuotaDatabase);
afterEach(() => new Promise((fatto) => setTimeout(fatto, 200)));

const token = (id: string) => jwt.sign({ sub: id, nome: 'Prova' }, env.JWT_SECRET, { expiresIn: '15m' });

async function chiama(metodo: string, percorso: string, chi: string, corpo?: unknown) {
  const r = await fetch(base + percorso, {
    method: metodo,
    headers: { Authorization: `Bearer ${token(chi)}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { stato: r.status, corpo: await r.json().catch(() => null) };
}

/** Un collaboratore il cui ruolo darebbe anche statistiche e gestione delle
 *  utenze: con "solo gli eventi assegnati" quelle restano chiuse. */
async function creaCollaboratore() {
  const chiavi = ['eventi.visualizza', 'eventi.crea', 'eventi.partenze', 'prenotazioni.visualizza', 'statistiche.visualizza', 'utenze.gestisci'];
  await db.insert(permessi).values(chiavi.map((chiave) => ({ chiave, etichetta: chiave, modulo: 'Prova', attivo: true }))).onConflictDoNothing();
  const [ruolo] = await db.insert(ruoli).values({ nome: `Collaboratori ${Date.now()}`, owner: false }).returning();
  await db.insert(ruoloPermessi).values(chiavi.map((permessoChiave) => ({ ruoloId: ruolo.id, permessoChiave })));
  const [collaboratore] = await db.insert(amministratori).values({
    nome: 'Luca Collaboratore', email: `luca-${Date.now()}@example.com`, passwordHash: 'non-usata', ruoloId: ruolo.id, soloEventiAssegnati: true,
  }).returning();
  return collaboratore;
}

/** Due eventi con un tragitto, una linea con bus e una prenotazione: il primo è del collaboratore. */
async function dueEventi(collaboratoreId: string) {
  const suo = await scenarioBase({ evento: { artista: 'Evento di Luca' } });
  const altro = await scenarioBase({ evento: { artista: 'Evento di un altro' } });
  const lineaSua = await creaLineaConBus(suo.tragitto.id, [suo.roma.id], 50);
  const lineaAltra = await creaLineaConBus(altro.tragitto.id, [altro.roma.id], 50);
  const cliente = await creaCliente();
  const prenotazioneSua = await prenotazioniService.crea(riga({ eventoId: suo.evento.id, tragittoId: suo.tragitto.id, fermataId: suo.roma.id }, cliente, { passeggeri: 2 }), cliente.id);
  const prenotazioneAltra = await prenotazioniService.crea(riga({ eventoId: altro.evento.id, tragittoId: altro.tragitto.id, fermataId: altro.roma.id }, cliente, { passeggeri: 1 }), cliente.id);
  await db.insert(eventoResponsabile).values({ eventoId: suo.evento.id, amministratoreId: collaboratoreId, compensoTipo: 'PERCENTUALE_INCASSO', compensoValore: '10' });
  return { suo, altro, lineaSua, lineaAltra, prenotazioneSua, prenotazioneAltra };
}

describe('collaboratore con solo gli eventi assegnati', () => {
  it('negli elenchi vede solo il suo evento', async () => {
    const luca = await creaCollaboratore();
    const { suo } = await dueEventi(luca.id);

    const eventi = await chiama('GET', '/eventi', luca.id);
    expect(eventi.corpo.map((e: { id: string }) => e.id)).toEqual([suo.evento.id]);

    const partenze = await chiama('GET', '/eventi/elenco-partenze', luca.id);
    expect(new Set(partenze.corpo.map((p: { evento: { id: string } }) => p.evento.id))).toEqual(new Set([suo.evento.id]));
  });

  it("prenotazioni, lista d'attesa e comunicazioni le gestisce il team OnWay, anche per il suo evento", async () => {
    const luca = await creaCollaboratore();
    const { suo, prenotazioneSua } = await dueEventi(luca.id);
    for (const [metodo, percorso, corpo] of [
      ['GET', '/prenotazioni'],
      ['POST', `/prenotazioni/${prenotazioneSua.pnr}/cancella`, {}],
      ['GET', `/lista-attesa/eventi/${suo.evento.id}`],
      ['GET', '/lista-attesa/allerte'],
      ['GET', `/comunicazioni/evento/${suo.evento.id}`],
      ['POST', `/comunicazioni/evento/${suo.evento.id}`, { oggetto: 'Ciao', corpo: 'Prova', canali: ['EMAIL'] }],
    ] as [string, string, unknown?][]) {
      expect({ percorso, stato: (await chiama(metodo, percorso, luca.id, corpo)).stato }).toEqual({ percorso, stato: 403 });
    }
  });

  it("l'evento di un altro non esiste per lui, qualunque strada provi", async () => {
    const luca = await creaCollaboratore();
    const { suo, altro, lineaSua, lineaAltra } = await dueEventi(luca.id);

    // Il suo si apre...
    expect((await chiama('GET', `/eventi/${suo.evento.id}`, luca.id)).stato).toBe(200);
    expect((await chiama('GET', `/eventi/tragitti/${suo.tragitto.id}/linee`, luca.id)).stato).toBe(200);
    expect((await chiama('GET', `/eventi/${suo.evento.id}/bus/${lineaSua.bus.id}/passeggeri`, luca.id)).stato).toBe(200);
    expect((await chiama('GET', `/preventivi/tragitto/${suo.tragitto.id}`, luca.id)).stato).toBe(200);

    // ...quello di un altro no, dall'evento, dal tragitto, dalla linea, dal bus, dal preventivo.
    for (const [metodo, percorso, corpo] of [
      ['GET', `/eventi/${altro.evento.id}`],
      ['PUT', `/eventi/${altro.evento.id}`, { artista: 'Rubato' }],
      ['GET', `/eventi/tragitti/${altro.tragitto.id}/linee`],
      ['PUT', `/eventi/tragitti/${altro.tragitto.id}/posti-preventivo`, { postiBus: 30 }],
      ['DELETE', `/eventi/linee/${lineaAltra.linea.id}`],
      ['GET', `/eventi/${suo.evento.id}/bus/${lineaAltra.bus.id}/passeggeri`],
      ['GET', `/preventivi/tragitto/${altro.tragitto.id}`],
    ] as [string, string, unknown?][]) {
      expect({ percorso, stato: (await chiama(metodo, percorso, luca.id, corpo)).stato }).toEqual({ percorso, stato: 404 });
    }
  });

  it("statistiche, prenotazioni e gestione delle utenze restano chiuse anche se il ruolo le dà", async () => {
    const luca = await creaCollaboratore();
    await dueEventi(luca.id);
    expect((await chiama('GET', '/statistiche/panoramica', luca.id)).stato).toBe(403);
    expect((await chiama('GET', '/amministratori', luca.id)).stato).toBe(403);
    expect((await chiama('GET', '/collaboratori/compensi', luca.id)).stato).toBe(403);
    const sessione = await chiama('GET', '/auth/me', luca.id);
    expect(sessione.corpo.admin.soloEventiAssegnati).toBe(true);
    // La parte operativa di serie, qualunque sia il ruolo.
    expect(sessione.corpo.admin.permessi.sort()).toEqual([...PERMESSI_COLLABORATORE].sort());
  });

  it('permessi automatici: il proprietario lo crea senza ruolo e può togliergli singole voci, non aggiungerne', async () => {
    const proprietario = await creaAmministratore({ owner: true });
    await db.insert(permessi).values([...PERMESSI_COLLABORATORE].map((chiave) => ({ chiave, etichetta: chiave, modulo: 'Prova', attivo: true }))).onConflictDoNothing();
    const creato = await chiama('POST', '/amministratori', proprietario.id, {
      nome: 'Sara Collaboratrice', email: `sara-${Date.now()}@example.com`, password: 'una-password-lunga', soloEventiAssegnati: true,
    });
    expect(creato.stato).toBe(201);
    const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, creato.corpo.ruoloId));
    expect(ruolo).toMatchObject({ nome: 'Collaboratore', owner: false });

    const permessiSara = await chiama('GET', `/amministratori/${creato.corpo.id}/permessi`, proprietario.id);
    expect(permessiSara.corpo).toMatchObject({ collaboratore: true });
    expect(permessiSara.corpo.permessiRuolo.sort()).toEqual([...PERMESSI_COLLABORATORE].sort());

    // Tolto "crea eventi": non può più crearne.
    expect((await chiama('PUT', `/amministratori/${creato.corpo.id}/permessi`, proprietario.id, { eccezioni: [{ chiave: 'eventi.crea', concesso: false }] })).stato).toBe(200);
    const sessione = await chiama('GET', '/auth/me', creato.corpo.id);
    expect(sessione.corpo.admin.permessi).not.toContain('eventi.crea');
    expect(sessione.corpo.admin.permessi).toContain('eventi.partenze');
    // Oltre la parte operativa no.
    expect((await chiama('PUT', `/amministratori/${creato.corpo.id}/permessi`, proprietario.id, { eccezioni: [{ chiave: 'statistiche.visualizza', concesso: true }] })).stato).toBe(409);
    // E mai su sé stessi.
    expect((await chiama('PUT', `/amministratori/${proprietario.id}`, proprietario.id, { soloEventiAssegnati: true })).stato).toBe(409);
  });

  it("un evento creato da lui è suo, con il compenso da decidere", async () => {
    const luca = await creaCollaboratore();
    const creato = await chiama('POST', '/eventi', luca.id, {
      artista: 'Nuovo evento di Luca', genere: 'Pop', luogo: 'Arena', citta: 'Verona', data: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    expect(creato.stato).toBe(201);
    const [assegnazione] = await db.select().from(eventoResponsabile).where(eq(eventoResponsabile.eventoId, creato.corpo.id));
    expect(assegnazione).toMatchObject({ amministratoreId: luca.id, compensoTipo: 'FISSO', compensoValore: '0.00' });
    expect((await chiama('GET', `/eventi/${creato.corpo.id}`, luca.id)).stato).toBe(200);
  });
});

describe('compenso del responsabile', () => {
  it('lo vede lui in "Il mio compenso", e nelle Statistiche è una spesa dell\'evento', async () => {
    const luca = await creaCollaboratore();
    const proprietario = await creaAmministratore({ owner: true });
    const { suo } = await dueEventi(luca.id);

    // 2 posti da 40 € = 80 € di incasso: il 10% sono 8 €.
    const miei = await chiama('GET', '/collaboratori/miei', luca.id);
    expect(miei.corpo).toHaveLength(1);
    expect(miei.corpo[0]).toMatchObject({ eventoId: suo.evento.id, regola: "10% sull'incasso", previsto: 8, aOggi: 8, pagatoIl: null });
    expect(miei.corpo[0].responsabile).toBeUndefined();

    const statistiche = await chiama('GET', `/statistiche/eventi/${suo.evento.id}`, proprietario.id);
    expect(statistiche.corpo.sintesi).toMatchObject({ incasso: 80, compenso: 8, margine: 80 - 0 - 8 });
  });

  it('il proprietario assegna, cambia, segna pagato; un collaboratore con eventi non si elimina', async () => {
    const luca = await creaCollaboratore();
    const proprietario = await creaAmministratore({ owner: true });
    const { altro } = await dueEventi(luca.id);

    const assegnato = await chiama('PUT', `/collaboratori/evento/${altro.evento.id}`, proprietario.id, { amministratoreId: luca.id, compensoTipo: 'FISSO', compensoValore: 50 });
    expect(assegnato.stato).toBe(200);
    expect(assegnato.corpo).toMatchObject({ responsabile: 'Luca Collaboratore', regola: '50 € fisso', previsto: 50 });
    // Ora anche l'altro evento è suo.
    expect((await chiama('GET', `/eventi/${altro.evento.id}`, luca.id)).stato).toBe(200);

    expect((await chiama('PUT', `/collaboratori/evento/${altro.evento.id}`, proprietario.id, { amministratoreId: luca.id, compensoTipo: 'PERCENTUALE_MARGINE', compensoValore: 120 })).stato).toBe(400);

    const pagato = await chiama('POST', `/collaboratori/evento/${altro.evento.id}/pagato`, proprietario.id, {});
    expect(pagato.corpo).toMatchObject({ importoPagato: 50 });
    expect(pagato.corpo.pagatoIl).toBeTruthy();

    const elimina = await chiama('DELETE', `/amministratori/${luca.id}`, proprietario.id);
    expect(elimina.stato).toBe(409);
    expect(elimina.corpo.errore).toMatch(/responsabile di 2 eventi/);
  });
});
