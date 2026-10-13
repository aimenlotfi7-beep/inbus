import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { creaApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { conversazioniChat, fornitori, listaAttesa, messaggiChat, richiesteRimborso } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { richiesteRimborsoService } from '../richieste-rimborso/richieste-rimborso.service.js';
import { chatService } from '../chat/chat.routes.js';
import { creaAmministratore, creaFornitore, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// I pallini di avviso del menu del gestionale (AdminLayout: rimborsi,
// chat, lista d'attesa, fornitori da approvare). Si contano sul server:
// qui si controlla che compaiano quando c'è qualcosa da fare, che
// tornino a zero quando è stato fatto, e che non si vedano senza il
// permesso giusto.

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

const token = (id: string) => jwt.sign({ sub: id, nome: 'Admin di prova' }, env.JWT_SECRET, { expiresIn: '15m' });

async function conta(percorso: string, idAdmin: string) {
  const risposta = await fetch(base + percorso, { headers: { Authorization: `Bearer ${token(idAdmin)}` } });
  const corpo = await risposta.json().catch(() => null);
  return { stato: risposta.status, conteggio: corpo?.conteggio as number | undefined };
}

const PERCORSI = {
  rimborsi: '/richieste-rimborso/conta-in-attesa',
  chat: '/chat/conversazioni/non-lette',
  listaAttesa: '/lista-attesa/allerte',
  fornitori: '/fornitori/conta-in-attesa',
};

describe('pallini del menu: rimborsi', () => {
  it('compare con una richiesta in attesa e torna a zero quando è gestita', async () => {
    const admin = await creaAmministratore({ owner: true });
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);
    expect(await conta(PERCORSI.rimborsi, admin.id)).toEqual({ stato: 200, conteggio: 0 });

    const richiesta = await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);
    expect((await conta(PERCORSI.rimborsi, admin.id)).conteggio).toBe(1);

    await richiesteRimborsoService.rifiuta(richiesta.id, 'fuori tempo');
    expect((await conta(PERCORSI.rimborsi, admin.id)).conteggio).toBe(0);
  });
});

describe('pallini del menu: chat', () => {
  it('conta le conversazioni con messaggi del cliente non letti, non quelle chiuse', async () => {
    const admin = await creaAmministratore({ owner: true });
    const s = await scenarioBase();
    const [conv] = await db.insert(conversazioniChat).values({
      eventoId: s.evento.id, clienteEmail: s.cliente.email, clienteNome: 'Mario', stato: 'APERTA',
    }).returning();
    await db.insert(messaggiChat).values({
      eventoId: s.evento.id, conversazioneId: conv.id, autore: 'CLIENTE', nome: 'Mario', email: s.cliente.email, testo: 'Buongiorno', letto: false,
    });
    expect((await conta(PERCORSI.chat, admin.id)).conteggio).toBe(1);

    // Letta: il pallino sparisce.
    await chatService.segnaLetti(conv.id);
    expect((await conta(PERCORSI.chat, admin.id)).conteggio).toBe(0);

    // Un messaggio nuovo non letto in una conversazione CHIUSA non conta.
    await db.update(conversazioniChat).set({ stato: 'CHIUSA' }).where(eq(conversazioniChat.id, conv.id));
    await db.insert(messaggiChat).values({
      eventoId: s.evento.id, conversazioneId: conv.id, autore: 'CLIENTE', nome: 'Mario', email: s.cliente.email, testo: 'Ancora io', letto: false,
    });
    expect((await conta(PERCORSI.chat, admin.id)).conteggio).toBe(0);
  });
});

describe("pallini del menu: lista d'attesa e fornitori", () => {
  it("la lista d'attesa conta solo le iscrizioni ancora in attesa", async () => {
    const admin = await creaAmministratore({ owner: true });
    const s = await scenarioBase();
    const [iscrizione] = await db.insert(listaAttesa).values({
      eventoId: s.evento.id, nome: 'Anna', email: 'anna@example.com', telefono: '3330000000', passeggeri: 2, stato: 'IN_ATTESA',
    }).returning();
    expect((await conta(PERCORSI.listaAttesa, admin.id)).conteggio).toBe(1);

    await db.update(listaAttesa).set({ stato: 'PROMOSSA' }).where(eq(listaAttesa.id, iscrizione.id));
    expect((await conta(PERCORSI.listaAttesa, admin.id)).conteggio).toBe(0);
  });

  it('i fornitori contano solo quelli da approvare', async () => {
    const admin = await creaAmministratore({ owner: true });
    const f = await creaFornitore({ stato: 'IN_ATTESA' });
    await creaFornitore({ stato: 'APPROVATO' });
    expect((await conta(PERCORSI.fornitori, admin.id)).conteggio).toBe(1);

    await db.update(fornitori).set({ stato: 'APPROVATO' }).where(eq(fornitori.id, f.id));
    expect((await conta(PERCORSI.fornitori, admin.id)).conteggio).toBe(0);
  });
});

describe('pallini e permessi', () => {
  it('senza il permesso il contatore non si legge (il gestionale non mostra il pallino)', async () => {
    const senzaNulla = await creaAmministratore({ owner: false });
    for (const percorso of Object.values(PERCORSI)) {
      expect((await conta(percorso, senzaNulla.id)).stato).toBe(403);
    }
  });

  it('una richiesta in attesa non fa pallini a chi non gestisce i pagamenti', async () => {
    const senzaNulla = await creaAmministratore({ owner: false });
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);
    await richiesteRimborsoService.richiedi(p.pnr, s.cliente.email);
    expect((await conta(PERCORSI.rimborsi, senzaNulla.id)).stato).toBe(403);
    expect((await db.select().from(richiesteRimborso)).length).toBe(1);
  });
});
