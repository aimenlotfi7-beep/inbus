import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { creaApp } from '../app.js';

// Protezioni generali del server, chiamandolo davvero: intestazioni di
// sicurezza, limiti anti-abuso per visitatore (dietro il proxy di
// Railway) e dimensione massima delle richieste.

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

/** Come arriva una richiesta da Railway: il proxy aggiunge l'indirizzo
 *  vero del visitatore in X-Forwarded-For. */
function daVisitatore(ip: string, percorso: string, corpo: unknown) {
  return fetch(base + percorso, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

describe('Intestazioni di sicurezza', () => {
  it('ogni risposta porta le protezioni e non dice che server è', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-powered-by')).toBeNull();
  });
});

describe('Limiti anti-abuso per visitatore', () => {
  it('chi prova troppe volte lo stesso account si ferma, gli altri visitatori no', async () => {
    // Senza password la richiesta è rifiutata (400) prima di toccare il
    // database, ma conta lo stesso come tentativo.
    for (let i = 0; i < 10; i++) {
      expect((await daVisitatore('203.0.113.1', '/auth/admin/login', { email: 'mario@esempio.it' })).status).toBe(400);
    }
    const undicesimo = await daVisitatore('203.0.113.1', '/auth/admin/login', { email: 'mario@esempio.it' });
    expect(undicesimo.status).toBe(429);
    expect((await undicesimo.json()).errore).toMatch(/Troppi tentativi/);

    // Un altro visitatore, e lo stesso visitatore con un altro account, passano.
    expect((await daVisitatore('203.0.113.2', '/auth/admin/login', { email: 'mario@esempio.it' })).status).toBe(400);
    expect((await daVisitatore('203.0.113.1', '/auth/admin/login', { email: 'giulia@esempio.it' })).status).toBe(400);
  });

  it('chi prova tanti account diversi dallo stesso indirizzo si ferma a 50', async () => {
    for (let i = 0; i < 50; i++) {
      expect((await daVisitatore('203.0.113.3', '/auth/admin/login', { email: `utente${i}@esempio.it` })).status).toBe(400);
    }
    expect((await daVisitatore('203.0.113.3', '/auth/admin/login', { email: 'ultimo@esempio.it' })).status).toBe(429);
  });

  it('i codici sconto non si possono provare a raffica', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await daVisitatore('203.0.113.4', '/coupon/valida', { codice: '' })).status).toBe(400);
    }
    expect((await daVisitatore('203.0.113.4', '/coupon/valida', { codice: '' })).status).toBe(429);
  });
});

describe('Dimensione e forma delle richieste', () => {
  const troppoGrande = JSON.stringify({ codice: 'x'.repeat(3 * 1024 * 1024) });

  it('una richiesta enorme viene rifiutata con un messaggio chiaro, non come guasto', async () => {
    const r = await daVisitatore('203.0.113.5', '/coupon/valida', troppoGrande);
    expect(r.status).toBe(413);
    expect((await r.json()).codice).toBe('RICHIESTA_TROPPO_GRANDE');
  });

  it('i preventivi con il PDF allegato possono essere grandi', async () => {
    const corpo = JSON.stringify({ prezzo: 100, postiBus: 50, fileContenuto: 'A'.repeat(3 * 1024 * 1024) });
    const r = await daVisitatore('203.0.113.6', '/preventivi/pubblico/codice-inesistente/rispondi', corpo);
    expect(r.status).not.toBe(413);
  });

  it('un JSON rotto è un errore di chi lo manda (400), non del server', async () => {
    const r = await daVisitatore('203.0.113.7', '/coupon/valida', '{"codice": ');
    expect(r.status).toBe(400);
    expect((await r.json()).codice).toBe('JSON_NON_VALIDO');
  });
});
