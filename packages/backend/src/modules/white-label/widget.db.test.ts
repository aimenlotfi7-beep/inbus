import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { creaApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { eventi, organizzatoreEventi, organizzatori, whiteLabel, whiteLabelEventi } from '../../db/schema.js';
import { creaAmministratore, creaEvento, fraGiorni, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// "Visibile sul sito" spento nasconde l'evento dal sito OnWay, non dal
// widget White Label dell'organizzatore (deciso dal proprietario). Da
// settembre 2026 una White Label vende uno o più eventi scelti uno per uno:
// con uno si va dritti alla prenotazione, con più si sceglie tra le card.

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
beforeEach(async () => {
  await svuotaDatabase();
  await db.delete(organizzatori);
});

const stato = async (percorso: string) => (await fetch(base + percorso)).status;
const leggi = async (percorso: string) => (await fetch(base + percorso)).json();

let progressivo = 0;
async function widgetPer(...eventiIds: string[]) {
  progressivo += 1;
  const [org] = await db.insert(organizzatori).values({ nome: 'Organizzatore', email: `org-${progressivo}@example.com`, passwordHash: 'x' }).returning();
  const [wl] = await db.insert(whiteLabel).values({ organizzatoreId: org.id, publicWidgetId: `widget-${progressivo}` }).returning();
  if (eventiIds.length) await db.insert(whiteLabelEventi).values(eventiIds.map((eventoId) => ({ whiteLabelId: wl.id, eventoId })));
  return { widget: wl.publicWidgetId, whiteLabelId: wl.id, organizzatoreId: org.id };
}

describe('widget White Label', () => {
  it('evento nascosto dal sito: il sito non lo apre, il widget sì', async () => {
    const { evento } = await scenarioBase({ evento: { visibileSito: false } });
    const { widget } = await widgetPer(evento.id);
    expect(await stato(`/eventi/slug/${evento.slug}`)).toBe(404);
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(200);
  });

  it('bozza, cestino o data passata restano chiusi anche dal widget', async () => {
    const { evento } = await scenarioBase();
    const { widget } = await widgetPer(evento.id);
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(200);
    await db.update(eventi).set({ bozza: true }).where(eq(eventi.id, evento.id));
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(404);
  });

  it('il widget non apre un evento che non è nel suo elenco', async () => {
    const { evento } = await scenarioBase();
    const altro = await creaEvento();
    const { widget } = await widgetPer(evento.id);
    expect(await stato(`/public/widget/${widget}/evento?eventoId=${altro.id}`)).toBe(404);
    expect(await stato(`/public/widget/${widget}/opzioni-partenza?eventoId=${altro.id}`)).toBe(404);
  });
});

describe('White Label con più eventi', () => {
  it('le card di quelli in vendita dal più vicino, con il prezzo vero; ?evento= apre quello', async () => {
    const lontano = await scenarioBase({ evento: { artista: 'Lontano', data: fraGiorni(90) } });
    const vicino = await scenarioBase({ evento: { artista: 'Vicino', data: fraGiorni(20) } });
    const bozza = await scenarioBase({ evento: { artista: 'Bozza', bozza: true } });
    const fermo = await scenarioBase({ evento: { artista: 'Fermo', venditeFermate: true } });
    const passato = await scenarioBase({ evento: { artista: 'Passato', data: fraGiorni(-10) } });
    const { widget } = await widgetPer(lontano.evento.id, vicino.evento.id, bozza.evento.id, fermo.evento.id, passato.evento.id);

    const tutte = await leggi(`/public/widget/${widget}`);
    expect(tutte.evento).toBeNull();
    expect(tutte.eventi.map((e: { artista: string }) => e.artista)).toEqual(['Vicino', 'Lontano']);
    // Due fermate da 40 € e 30 €: "da 30 €".
    expect(tutte.eventi[0].prezzoMinimo).toBe(30);

    const uno = await leggi(`/public/widget/${widget}?evento=${lontano.evento.slug}`);
    expect(uno.evento.id).toBe(lontano.evento.id);
    // Un evento che non c'è più non è un errore: si vedono le card.
    expect((await leggi(`/public/widget/${widget}?evento=${passato.evento.slug}`)).evento).toBeNull();

    // Per prenotare va detto quale evento, ed è solo uno di quelli dell'elenco.
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(400);
    expect(await stato(`/public/widget/${widget}/evento?eventoId=${vicino.evento.id}`)).toBe(200);
  });

  it('con un evento solo si apre subito; senza eventi in vendita nessuna card', async () => {
    const { evento } = await scenarioBase();
    const { widget } = await widgetPer(evento.id);
    const dati = await leggi(`/public/widget/${widget}`);
    expect(dati.evento.id).toBe(evento.id);
    expect(dati.eventi).toHaveLength(1);

    const vuota = await widgetPer();
    expect(await leggi(`/public/widget/${vuota.widget}`)).toMatchObject({ evento: null, eventi: [] });
  });

  it("cambiare l'evento (l'anno dopo) lascia lo stesso link e associa l'evento all'organizzatore", async () => {
    const proprietario = await creaAmministratore({ owner: true });
    const token = jwt.sign({ sub: proprietario.id, nome: 'Prova' }, env.JWT_SECRET, { expiresIn: '15m' });
    const vecchio = await scenarioBase({ evento: { artista: 'Edizione 2026' } });
    const nuovo = await scenarioBase({ evento: { artista: 'Edizione 2027' } });
    const { widget, whiteLabelId, organizzatoreId } = await widgetPer(vecchio.evento.id);

    const risposta = await fetch(`${base}/admin/white-label/${whiteLabelId}/eventi`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventiIds: [nuovo.evento.id] }),
    });
    expect(risposta.status).toBe(200);
    const aggiornata = await risposta.json();
    expect(aggiornata.publicWidgetId).toBe(widget);
    expect(aggiornata.eventi.map((e: { artista: string }) => e.artista)).toEqual(['Edizione 2027']);

    expect((await leggi(`/public/widget/${widget}`)).evento.id).toBe(nuovo.evento.id);
    const associato = await db.select().from(organizzatoreEventi)
      .where(and(eq(organizzatoreEventi.organizzatoreId, organizzatoreId), eq(organizzatoreEventi.eventoId, nuovo.evento.id)));
    expect(associato).toHaveLength(1);
  });
});
