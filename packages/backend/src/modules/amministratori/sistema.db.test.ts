import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { creaApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { amministratori, promoter, promoterEventi } from '../../db/schema.js';
import { creaAmministratore, creaEvento, svuotaDatabase } from '../../../test/dati.js';
import { posta } from '../../../test/posta.js';

// Amministratori (disattivare, link per la password), Impostazioni che il
// server scarterebbe, eventi esclusi dei promoter: chiamando il server.

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
// Il registro attività si scrive dopo la risposta: si aspetta che finisca
// prima di svuotare il database per il test dopo.
afterEach(() => new Promise((fatto) => setTimeout(fatto, 200)));

const tokenAdmin = (id: string) => jwt.sign({ sub: id, nome: 'Admin di prova' }, env.JWT_SECRET, { expiresIn: '15m' });

async function chiama(metodo: string, percorso: string, token: string, corpo?: unknown) {
  const risposta = await fetch(base + percorso, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { stato: risposta.status, corpo: await risposta.json().catch(() => null) };
}

describe('Amministratori', () => {
  it('si disattiva e si riattiva un collega, ma non sé stessi', async () => {
    const io = await creaAmministratore({ owner: true });
    const collega = await creaAmministratore({ owner: false });
    const token = tokenAdmin(io.id);
    expect((await chiama('PUT', `/amministratori/${collega.id}`, token, { attivo: false })).corpo.attivo).toBe(false);
    expect((await chiama('PUT', `/amministratori/${collega.id}`, token, { attivo: true })).corpo.attivo).toBe(true);
    expect((await chiama('PUT', `/amministratori/${io.id}`, token, { attivo: false })).stato).toBe(409);
  });

  it('due proprietari che si disattivano a vicenda nello stesso istante: uno solo passa', async () => {
    // Controllo della logica, ottobre 2026: prima si contava e poi si
    // scriveva, e restavano fuori tutti e due — nessuno poteva più
    // entrare nel gestionale.
    const uno = await creaAmministratore({ owner: true });
    const due = await creaAmministratore({ owner: true });
    const esiti = await Promise.all([
      chiama('PUT', `/amministratori/${due.id}`, tokenAdmin(uno.id), { attivo: false }),
      chiama('PUT', `/amministratori/${uno.id}`, tokenAdmin(due.id), { attivo: false }),
    ]);
    expect(esiti.filter((e) => e.stato === 200)).toHaveLength(1);
    expect(esiti.filter((e) => e.stato === 409)).toHaveLength(1);
    const attivi = (await db.select().from(amministratori)).filter((a) => a.attivo);
    expect(attivi).toHaveLength(1);
  });

  it("l'ultimo proprietario non si elimina, nemmeno con un altro ruolo proprietario disattivato", async () => {
    const io = await creaAmministratore({ owner: true });
    const altro = await creaAmministratore({ owner: true, attivo: false });
    // Ce n'è un altro (disattivato, riattivabile): l'eliminazione passa.
    expect((await chiama('DELETE', `/amministratori/${altro.id}`, tokenAdmin(io.id))).stato).toBe(204);
    // Ora è l'unico rimasto.
    expect((await chiama('DELETE', `/amministratori/${io.id}`, tokenAdmin(io.id))).stato).toBe(409);
  });

  it('il link per una nuova password parte per email', async () => {
    const io = await creaAmministratore({ owner: true });
    const collega = await creaAmministratore({ owner: false });
    const { stato, corpo } = await chiama('POST', `/amministratori/${collega.id}/link-password`, tokenAdmin(io.id), {});
    expect(stato).toBe(200);
    expect(corpo.emailInviata).toBe(true);
    expect(posta.find((e) => e.a === collega.email)?.html).toContain('reimposta-password');
  });
});

describe('Impostazioni', () => {
  it('un valore che il server scarterebbe viene rifiutato con un messaggio', async () => {
    const token = tokenAdmin((await creaAmministratore({ owner: true })).id);
    const zero = await chiama('PUT', '/impostazioni/posti_per_bus', token, { valore: '0' });
    expect(zero.stato).toBe(400);
    expect(zero.corpo.errore).toContain('almeno 1');
    expect((await chiama('PUT', '/impostazioni/soglia_occupazione_pareggio', token, { valore: '120' })).stato).toBe(400);
    expect((await chiama('PUT', '/impostazioni/credito_referral_amico', token, { valore: '0' })).stato).toBe(200);
    expect((await chiama('PUT', '/impostazioni/raggio_km_preventivo', token, { valore: '60' })).stato).toBe(200);
  });
});

describe('Promoter', () => {
  it('l\'elenco del gestionale porta gli eventi esclusi', async () => {
    const token = tokenAdmin((await creaAmministratore({ owner: true })).id);
    const evento = await creaEvento();
    const [p] = await db.insert(promoter).values({ nome: 'Giulia', email: 'giulia@example.com', passwordHash: 'x', codice: 'GIU123' }).returning();
    await db.insert(promoterEventi).values({ promoterId: p.id, eventoId: evento.id });
    const { corpo } = await chiama('GET', '/promoter', token);
    expect(corpo.find((r: { id: string }) => r.id === p.id).eventiEsclusi).toEqual([evento.id]);
  });
});
