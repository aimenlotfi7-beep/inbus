import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { creaApp } from '../../app.js';
import { env } from '../../config/env.js';
import { creaAmministratore, creaCliente, creaEvento, creaFermata, creaTragitto, svuotaDatabase } from '../../../test/dati.js';

// Chi può vedere cosa, chiamando il server come fa il browser.

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

async function chiama(percorso: string, token?: string) {
  const risposta = await fetch(base + percorso, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { stato: risposta.status, corpo: await risposta.json().catch(() => null) };
}

const tokenAdmin = (id: string) => jwt.sign({ sub: id, nome: 'Admin di prova' }, env.JWT_SECRET, { expiresIn: '15m' });

describe('gestionale: solo con un\'utenza del gestionale attiva', () => {
  it('senza token: 401', async () => {
    expect((await chiama('/prenotazioni')).stato).toBe(401);
  });

  it('il token di un cliente non apre il gestionale', async () => {
    const cliente = await creaCliente();
    const token = jwt.sign({ tipo: 'cliente', sub: cliente.id, email: cliente.email }, env.JWT_SECRET, { expiresIn: '15m' });
    expect((await chiama('/prenotazioni', token)).stato).toBe(401);
  });

  it('nemmeno quello di un promoter con lo stesso id di un amministratore', async () => {
    const admin = await creaAmministratore();
    const token = jwt.sign({ tipo: 'promoter', sub: admin.id }, env.JWT_SECRET, { expiresIn: '15m' });
    expect((await chiama('/prenotazioni', token)).stato).toBe(401);
  });

  it('un token firmato con un altro segreto: 401', async () => {
    const admin = await creaAmministratore();
    const falso = jwt.sign({ sub: admin.id, nome: 'x' }, 'un-altro-segreto-lungo-abbastanza', { expiresIn: '15m' });
    expect((await chiama('/prenotazioni', falso)).stato).toBe(401);
  });

  it('proprietario attivo: entra', async () => {
    const admin = await creaAmministratore({ owner: true });
    expect((await chiama('/prenotazioni', tokenAdmin(admin.id))).stato).toBe(200);
  });

  it('utenza disattivata con un token ancora valido: 403, e il server continua a rispondere', async () => {
    const admin = await creaAmministratore({ owner: true, attivo: false });
    expect((await chiama('/prenotazioni', tokenAdmin(admin.id))).stato).toBe(403);
    expect((await chiama('/health')).stato).toBe(200);
  });

  it('ruolo senza il permesso richiesto: 403, e il server continua a rispondere', async () => {
    const admin = await creaAmministratore({ owner: false });
    expect((await chiama('/prenotazioni', tokenAdmin(admin.id))).stato).toBe(403);
    expect((await chiama('/health')).stato).toBe(200);
  });
});

describe('sito pubblico: niente bozze e niente dati interni', () => {
  async function eventoConCosti(o: { bozza?: boolean } = {}) {
    const evento = await creaEvento({ bozza: o.bozza ?? false });
    const tragitto = await creaTragitto(evento.id, { preventivoCosto: '1800', preventivoPostiBus: 50, referenteNome: 'Autista', referenteTelefono: '3471234567' });
    await creaFermata(tragitto.id);
    return evento;
  }

  it('un evento in bozza non si apre con il suo indirizzo', async () => {
    const bozza = await eventoConCosti({ bozza: true });
    expect((await chiama(`/eventi/${bozza.id}`)).stato).toBe(404);
  });

  it('dal gestionale la bozza si apre', async () => {
    const bozza = await eventoConCosti({ bozza: true });
    const admin = await creaAmministratore({ owner: true });
    expect((await chiama(`/eventi/${bozza.id}`, tokenAdmin(admin.id))).stato).toBe(200);
  });

  it('l\'elenco pubblico non mostra le bozze', async () => {
    const pubblico = await eventoConCosti();
    const bozza = await eventoConCosti({ bozza: true });
    const { corpo } = await chiama('/eventi');
    const ids = (Array.isArray(corpo) ? corpo : corpo.eventi ?? corpo.dati ?? []).map((e: { id: string }) => e.id);
    expect(ids).toContain(pubblico.id);
    expect(ids).not.toContain(bozza.id);
  });

  it('la pagina pubblica dell\'evento non mostra costo del bus, fornitore e referente', async () => {
    const evento = await eventoConCosti();
    for (const percorso of [`/eventi/${evento.id}`, `/eventi/slug/${evento.slug}`]) {
      const { stato, corpo } = await chiama(percorso);
      expect(stato).toBe(200);
      const testo = JSON.stringify(corpo);
      expect(testo).not.toContain('preventivoCosto');
      expect(testo).not.toContain('1800');
      expect(testo).not.toContain('3471234567');
    }
  });
});

describe('dati del cliente', () => {
  it('il saldo di una prenotazione non si legge con un\'email sbagliata', async () => {
    expect((await chiama('/prenotazioni/IBNONESISTE/saldo?email=chiunque@example.com')).stato).toBe(404);
  });
});
