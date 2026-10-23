import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { listaAttesaService } from '../lista-attesa/lista-attesa.service.js';
import { creaCliente, fraGiorni, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Fine vendite per data (proprietario, ottobre 2026): dalla data in poi
// nessuno compra più, ma la lista d'attesa resta aperta — al contrario
// dell'interruttore "Ferma vendite", che blocca anche quella.

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('giorni_fine_vendite', 2);
});

const compra = (s: Awaited<ReturnType<typeof scenarioBase>>, cliente: { email: string }, id: string) =>
  prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, cliente), id);

const iscriviti = (eventoId: string, email: string) => listaAttesaService.iscriviti({
  eventoId, passeggeri: 1, partecipanti: [],
  cliente: { nome: 'Anna', cognome: 'Verdi', email, telefono: '3330000000' },
});

describe('fine vendite dal valore generale', () => {
  it('con l\'evento lontano si compra', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(10) } });
    const cliente = await creaCliente();
    expect((await compra(s, cliente, cliente.id)).pnr).toBeTruthy();
  });

  it('dentro i 2 giorni non si compra più, ma la lista d\'attesa funziona', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(1) } });
    const cliente = await creaCliente();
    await expect(compra(s, cliente, cliente.id)).rejects.toThrow(/lista d'attesa/);
    await expect(iscriviti(s.evento.id, 'anna@example.com')).resolves.toMatchObject({ eventoId: s.evento.id });
  });
});

describe('fine vendite scritta sull\'evento', () => {
  it('vince su quella generale: chiude anche se l\'evento è lontano', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(60) } });
    await db.update(eventi).set({ fineVenditeIl: fraGiorni(-1) }).where(eq(eventi.id, s.evento.id));
    const cliente = await creaCliente();
    await expect(compra(s, cliente, cliente.id)).rejects.toThrow(/lista d'attesa/);
  });

  it('vince su quella generale: tiene aperto anche a ridosso dell\'evento', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(1) } });
    await db.update(eventi).set({ fineVenditeIl: fraGiorni(1) }).where(eq(eventi.id, s.evento.id));
    const cliente = await creaCliente();
    expect((await compra(s, cliente, cliente.id)).pnr).toBeTruthy();
  });
});

describe('"Ferma vendite" resta un\'altra cosa', () => {
  it('blocca anche la lista d\'attesa', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(10) } });
    await db.update(eventi).set({ venditeFermate: true }).where(eq(eventi.id, s.evento.id));
    const cliente = await creaCliente();
    await expect(compra(s, cliente, cliente.id)).rejects.toThrow(/chiuse/);
    await expect(iscriviti(s.evento.id, 'anna@example.com')).rejects.toThrow(/chiuse/);
  });
});
