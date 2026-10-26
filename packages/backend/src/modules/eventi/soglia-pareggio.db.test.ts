import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, linee, prenotazioni } from '../../db/schema.js';
import { statisticheService } from '../statistiche/statistiche.service.js';
import { sogliaPareggioSchema } from './eventi.dto.js';
import { eventiService } from './eventi.service.js';
import { lineeDaConfermareService } from './linee-da-confermare.service.js';
import { risolviSoglia, sogliaDelTragitto } from './soglia-pareggio.js';
import { creaCliente, creaEvento, creaFermata, creaTragitto, fraGiorni, impostazione, svuotaDatabase } from '../../../test/dati.js';

// Soglia di pareggio per evento e per tragitto (proprietario, ottobre 2026:
// «se un evento è molto popolare posso rischiare di più»). Impostazioni vale
// per tutti; l'evento può averne una sua, il tragitto anche, e vince lui.

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('soglia_occupazione_pareggio', 50);
  await impostazione('giorni_decisione_piano', 30);
});

/** Un tragitto in vendita con quotazione per un bus da 20 posti (pareggio generale: 10). */
async function tragittoDaVenti() {
  const evento = await creaEvento({ data: fraGiorni(60) });
  const tragitto = await creaTragitto(evento.id, { stato: 'PREZZATO', preventivoCosto: '1000', preventivoPostiBus: 20, nome: 'Bari → Roma' });
  await creaFermata(tragitto.id, { citta: 'Bari', prezzo: '50', orario: '08:00', ordine: 0 });
  return { evento, tragitto };
}

async function prenotati(eventoId: string, tragittoId: string, quanti: number) {
  const cliente = await creaCliente();
  await db.insert(prenotazioni).values({
    pnr: `IBSOG${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    eventoId, tragittoId, fermataCitta: 'Bari', passeggeri: quanti, totale: '300', utenteId: cliente.id,
  });
}

const proposte = (tragittoId: string) => db.select({ id: linee.id }).from(linee).where(and(eq(linee.tragittoId, tragittoId), eq(linee.daConfermare, true)));

describe('quale soglia vale', () => {
  it('tragitto, poi evento, poi Impostazioni', () => {
    expect(risolviSoglia({}, 50)).toEqual({ valore: 50, fonte: 'generale' });
    expect(risolviSoglia({ evento: 30 }, 50)).toEqual({ valore: 30, fonte: 'evento' });
    expect(risolviSoglia({ tragitto: 80, evento: 30 }, 50)).toEqual({ valore: 80, fonte: 'tragitto' });
    expect(risolviSoglia({ tragitto: null, evento: null }, 50)).toEqual({ valore: 50, fonte: 'generale' });
  });

  it('il server accetta solo interi da 1 a 100, e null per toglierla', () => {
    expect(sogliaPareggioSchema.safeParse(35).success).toBe(true);
    expect(sogliaPareggioSchema.safeParse(null).success).toBe(true);
    for (const sbagliata of [0, 101, 33.5]) expect(sogliaPareggioSchema.safeParse(sbagliata).success).toBe(false);
  });
});

describe('contatore e proposte dei bus', () => {
  it('la soglia dell\'evento cambia il pareggio, quella del tragitto vince', async () => {
    const s = await tragittoDaVenti();
    await prenotati(s.evento.id, s.tragitto.id, 4);
    expect(await lineeDaConfermareService.contatore(s.tragitto.id)).toMatchObject({ contati: 4, pareggio: 10 });

    await db.update(eventi).set({ sogliaPareggio: 30 }).where(eq(eventi.id, s.evento.id));
    expect(await lineeDaConfermareService.contatore(s.tragitto.id)).toMatchObject({ pareggio: 6 });

    expect(await eventiService.impostaSogliaTragitto(s.tragitto.id, 15)).toEqual({ valore: 15, fonte: 'tragitto' });
    expect(await lineeDaConfermareService.contatore(s.tragitto.id)).toMatchObject({ pareggio: 3 });

    expect(await eventiService.impostaSogliaTragitto(s.tragitto.id, null)).toEqual({ valore: 30, fonte: 'evento' });
    expect(await sogliaDelTragitto(s.tragitto.id)).toEqual({ valore: 30, fonte: 'evento' });
  });

  it('un evento popolare con la soglia più bassa propone il bus prima', async () => {
    const s = await tragittoDaVenti();
    await prenotati(s.evento.id, s.tragitto.id, 7);
    await lineeDaConfermareService.allinea(s.tragitto.id, { senzaInvii: true });
    expect(await proposte(s.tragitto.id)).toHaveLength(0); // 7 su un pareggio generale di 10

    await eventiService.update(s.evento.id, { sogliaPareggio: 35 });
    await lineeDaConfermareService.allinea(s.tragitto.id, { senzaInvii: true });
    expect(await proposte(s.tragitto.id)).toHaveLength(1); // pareggio a 7

    // Gli altri eventi seguono ancora Impostazioni.
    const altro = await tragittoDaVenti();
    await prenotati(altro.evento.id, altro.tragitto.id, 7);
    await lineeDaConfermareService.allinea(altro.tragitto.id, { senzaInvii: true });
    expect(await proposte(altro.tragitto.id)).toHaveLength(0);
  });

  it('salvare l\'evento senza il campo non tocca la soglia; null la toglie', async () => {
    const s = await tragittoDaVenti();
    await eventiService.update(s.evento.id, { sogliaPareggio: 40 });
    await eventiService.update(s.evento.id, { artista: 'Nome nuovo' });
    expect((await sogliaDelTragitto(s.tragitto.id)).valore).toBe(40);
    await eventiService.update(s.evento.id, { sogliaPareggio: null });
    expect(await sogliaDelTragitto(s.tragitto.id)).toEqual({ valore: 50, fonte: 'generale' });
  });
});

describe('statistiche', () => {
  it('la scheda dell\'evento dice la sua soglia e i tragitti che ne hanno una diversa', async () => {
    const s = await tragittoDaVenti();
    await db.update(eventi).set({ sogliaPareggio: 40 }).where(eq(eventi.id, s.evento.id));
    let d = await statisticheService.evento(s.evento.id);
    expect(d).toMatchObject({ sogliaPareggio: 40, fonteSoglia: 'evento', soglieTragitti: [] });

    await eventiService.impostaSogliaTragitto(s.tragitto.id, 25);
    d = await statisticheService.evento(s.evento.id);
    expect(d.soglieTragitti).toEqual([{ nome: 'Bari → Roma', soglia: 25 }]);
  });
});
