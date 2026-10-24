import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, linee, prenotazioni, preventiviRichieste } from '../../db/schema.js';
import { lineeDaConfermareService } from './linee-da-confermare.service.js';
import { creaCliente, creaEvento, creaFermata, creaFornitore, creaTragitto, fraGiorni, impostazione, svuotaDatabase } from '../../../test/dati.js';

// "Crea piano" (proprietario, ottobre 2026): l'anteprima mostra come
// sarebbero i bus se si decidesse adesso — quanti, da dove partono, chi
// ci sale — e la conferma anticipa a oggi la data di decisione, facendo
// partire le richieste ai fornitori.

beforeEach(async () => {
  await svuotaDatabase();
  // La decisione sarebbe fra un mese: niente richieste finché non si conferma.
  await impostazione('giorni_decisione_piano', 30);
  await impostazione('soglia_occupazione_pareggio', 50);
});

/** Percorso Lecce → Taranto → Foggia, quotazione 1000 € per un bus da 20
 *  posti (pareggio: 10 passeggeri). */
async function tragittoPugliese() {
  const evento = await creaEvento({ data: fraGiorni(60) });
  const tragitto = await creaTragitto(evento.id, { stato: 'PREZZATO', preventivoCosto: '1000', preventivoPostiBus: 20, nome: 'Puglia → Roma' });
  const lecce = await creaFermata(tragitto.id, { citta: 'Lecce', prezzo: '60', orario: '05:00', ordine: 0, lat: 40.35, lng: 18.17 });
  const taranto = await creaFermata(tragitto.id, { citta: 'Taranto', prezzo: '55', orario: '07:00', ordine: 1, lat: 40.47, lng: 17.24 });
  const foggia = await creaFermata(tragitto.id, { citta: 'Foggia', prezzo: '50', orario: '10:00', ordine: 2, lat: 41.46, lng: 15.55 });
  return { evento, tragitto, lecce, taranto, foggia };
}

/** `quanti` passeggeri confermati da una fermata. */
async function prenotati(eventoId: string, tragittoId: string, citta: string, quanti: number) {
  const cliente = await creaCliente();
  await db.insert(prenotazioni).values({
    pnr: `IB${citta.slice(0, 3).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    eventoId, tragittoId, fermataCitta: citta, passeggeri: quanti, totale: '500', utenteId: cliente.id,
  });
}

describe('anteprima del piano', () => {
  it('dice da dove partirebbe il bus: dalla prima fermata con prenotati', async () => {
    const s = await tragittoPugliese();
    await prenotati(s.evento.id, s.tragitto.id, 'Taranto', 12);

    const piano = (await lineeDaConfermareService.anteprimaPiano(s.tragitto.id))!;
    expect(piano.senzaQuotazione).toBe(false);
    expect(piano.voci).toHaveLength(1);
    expect(piano.voci[0].fermate).toEqual(['Taranto', 'Foggia']); // niente Lecce: lì non sale nessuno
    expect(piano.voci[0].passeggeri).toBe(12);
    expect(piano.voci[0].posti).toBe(20);
    expect(piano.costoStimatoTotale).toBe(1000);
    expect(piano.senzaPosto).toBe(0);
  });

  it('sotto il pareggio non propone nessun bus e lo dice col contatore', async () => {
    const s = await tragittoPugliese();
    await prenotati(s.evento.id, s.tragitto.id, 'Foggia', 4);

    const piano = (await lineeDaConfermareService.anteprimaPiano(s.tragitto.id))!;
    expect(piano.voci).toHaveLength(0);
    expect(piano.senzaPosto).toBe(4);
    expect(piano.contatore).toMatchObject({ contati: 4, pareggio: 10 });
  });

  it('senza quotazione lo dice invece di inventare un piano', async () => {
    const evento = await creaEvento({ data: fraGiorni(60) });
    const tragitto = await creaTragitto(evento.id, { stato: 'PREZZATO' });
    await creaFermata(tragitto.id, { citta: 'Bari', prezzo: '50', orario: '08:00', ordine: 0 });
    await prenotati(evento.id, tragitto.id, 'Bari', 30);

    const piano = (await lineeDaConfermareService.anteprimaPiano(tragitto.id))!;
    expect(piano.senzaQuotazione).toBe(true);
    expect(piano.voci).toHaveLength(0);
  });

  it('non scrive niente: nessuna richiesta parte guardando l\'anteprima', async () => {
    await creaFornitore({ nome: 'Bus Taranto', lat: 40.47, lng: 17.24, invioAutomatico: true });
    const s = await tragittoPugliese();
    await prenotati(s.evento.id, s.tragitto.id, 'Taranto', 12);

    await lineeDaConfermareService.anteprimaPiano(s.tragitto.id);
    expect(await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.scopo, 'BUS'))).toHaveLength(0);
  });
});

describe('conferma del piano', () => {
  it('anticipa la data di decisione e manda le richieste ai fornitori', async () => {
    const f = await creaFornitore({ nome: 'Bus Taranto', lat: 40.47, lng: 17.24, invioAutomatico: true });
    const s = await tragittoPugliese();
    await prenotati(s.evento.id, s.tragitto.id, 'Taranto', 12);
    await lineeDaConfermareService.allinea(s.tragitto.id);
    // Prima della conferma: la proposta c'è, le richieste no.
    expect(await db.select().from(linee).where(eq(linee.tragittoId, s.tragitto.id))).toHaveLength(1);
    expect(await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.scopo, 'BUS'))).toHaveLength(0);

    const esito = await lineeDaConfermareService.confermaPiano(s.evento.id);
    expect(esito.proposte).toBe(1);
    expect(esito.richiesteInviate).toBe(1);

    const [evento] = await db.select().from(eventi).where(eq(eventi.id, s.evento.id));
    expect(evento.decisionePianoIl).not.toBeNull();
    const richieste = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.scopo, 'BUS'));
    expect(richieste.map((r) => r.fornitoreId)).toEqual([f.id]);
  });

  it('confermato due volte non manda le richieste due volte', async () => {
    await creaFornitore({ nome: 'Bus Taranto', lat: 40.47, lng: 17.24, invioAutomatico: true });
    const s = await tragittoPugliese();
    await prenotati(s.evento.id, s.tragitto.id, 'Taranto', 12);
    // La proposta nasce prima della conferma: così le richieste partono
    // solo dalla conferma, e si contano senza corse con il sottofondo
    // (allinea manda da sé i preventivi delle proposte appena nate,
    // quando la data è già arrivata).
    await lineeDaConfermareService.allinea(s.tragitto.id);

    expect(await lineeDaConfermareService.confermaPiano(s.evento.id)).toMatchObject({ richiesteInviate: 1 });
    const dopoUna = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.scopo, 'BUS'));

    expect(await lineeDaConfermareService.confermaPiano(s.evento.id)).toMatchObject({ richiesteInviate: 0 });
    expect(await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.scopo, 'BUS'))).toHaveLength(dopoUna.length);
  });
});
