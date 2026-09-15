import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { creaApp } from '../../app.js';
import { db } from '../../db/client.js';
import { eventi, organizzatori, whiteLabel } from '../../db/schema.js';
import { creaEvento, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// "Visibile sul sito" spento nasconde l'evento dal sito OnWay, non dal
// widget White Label dell'organizzatore (deciso dal proprietario).

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

async function widgetPer(eventoId: string) {
  const [org] = await db.insert(organizzatori).values({ nome: 'Organizzatore', email: 'org@example.com', passwordHash: 'x' }).returning();
  const [wl] = await db.insert(whiteLabel).values({ organizzatoreId: org.id, eventoId, publicWidgetId: `widget-${eventoId}` }).returning();
  return wl.publicWidgetId;
}

describe('widget White Label', () => {
  it('evento nascosto dal sito: il sito non lo apre, il widget sì', async () => {
    const { evento } = await scenarioBase({ evento: { visibileSito: false } });
    const widget = await widgetPer(evento.id);
    expect(await stato(`/eventi/slug/${evento.slug}`)).toBe(404);
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(200);
  });

  it('bozza, cestino o data passata restano chiusi anche dal widget', async () => {
    const { evento } = await scenarioBase();
    const widget = await widgetPer(evento.id);
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(200);
    await db.update(eventi).set({ bozza: true }).where(eq(eventi.id, evento.id));
    expect(await stato(`/public/widget/${widget}/evento`)).toBe(404);
  });

  it('il widget di un evento non apre un altro evento', async () => {
    const { evento } = await scenarioBase();
    const altro = await creaEvento();
    const widget = await widgetPer(evento.id);
    const { id } = (await (await fetch(`${base}/public/widget/${widget}/evento?eventoId=${altro.id}`)).json()) as { id: string };
    expect(id).toBe(evento.id);
  });
});
