import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { fermate, prenotazioni } from '../../db/schema.js';
import { prenotazioniService } from './prenotazioni.service.js';
import { eventiService } from '../eventi/eventi.service.js';
import { creaEvento, creaFermata, creaCliente, creaTragitto, riga, svuotaDatabase } from '../../../test/dati.js';

// Due punti di salita nella STESSA città dello stesso tragitto — "Milano
// Lampugnano" e "Milano Famagosta" (proprietario, ottobre 2026). Prima la
// prenotazione salvava solo il nome della città: i posti prenotati
// tornavano liberi su entrambe le fermate e il prezzo si leggeva da una
// delle due a caso. Ora salva quale fermata.

beforeEach(svuotaDatabase);

/** Un tragitto con due fermate "Milano" a prezzi e limiti diversi. */
async function tragittoConDueMilano() {
  const evento = await creaEvento();
  const tragitto = await creaTragitto(evento.id);
  const lampugnano = await creaFermata(tragitto.id, { citta: 'Milano', indirizzo: 'Lampugnano', prezzo: '40', postiMax: 10, orario: '08:00', ordine: 0 });
  const famagosta = await creaFermata(tragitto.id, { citta: 'Milano', indirizzo: 'Famagosta', prezzo: '55', postiMax: 10, orario: '08:30', ordine: 1 });
  return { evento, tragitto, lampugnano, famagosta };
}

const postiDi = async (fermataId: string) => (await db.select().from(fermate).where(eq(fermate.id, fermataId)))[0].postiPrenotati;

describe('due fermate con la stessa città nello stesso tragitto', () => {
  it('la prenotazione salva quale fermata, non solo il nome della città', async () => {
    const { evento, tragitto, famagosta } = await tragittoConDueMilano();
    const cliente = await creaCliente();
    const p = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: famagosta.id }, cliente), cliente.id);

    const [salvata] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, p.pnr));
    expect(salvata.fermataId).toBe(famagosta.id);
    expect(salvata.fermataCitta).toBe('Milano');
    expect(salvata.fermataIndirizzo).toBe('Famagosta');
    // Il prezzo è quello della fermata scelta, non dell'altra "Milano".
    expect(Number(salvata.totalePrevisto)).toBe(55);
  });

  it('i posti si occupano e si liberano solo sulla fermata scelta', async () => {
    const { evento, tragitto, lampugnano, famagosta } = await tragittoConDueMilano();
    const cliente = await creaCliente();
    const p = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: lampugnano.id }, cliente, { passeggeri: 3 }), cliente.id);
    expect(await postiDi(lampugnano.id)).toBe(3);
    expect(await postiDi(famagosta.id)).toBe(0);

    await prenotazioniService.cancella(p.pnr, 'prova');
    // Prima qui Famagosta scendeva sotto zero (GREATEST la fermava a 0)
    // e Lampugnano tornava a 0 solo per caso: la condizione colpiva
    // entrambe le righe.
    expect(await postiDi(lampugnano.id)).toBe(0);
    expect(await postiDi(famagosta.id)).toBe(0);
  });

  it('due clienti sulle due fermate omonime: ognuno occupa la sua', async () => {
    const { evento, tragitto, lampugnano, famagosta } = await tragittoConDueMilano();
    const uno = await creaCliente();
    const due = await creaCliente();
    await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: lampugnano.id }, uno, { passeggeri: 2 }), uno.id);
    const secondo = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: famagosta.id }, due, { passeggeri: 4 }), due.id);

    expect(await postiDi(lampugnano.id)).toBe(2);
    expect(await postiDi(famagosta.id)).toBe(4);

    await prenotazioniService.cancella(secondo.pnr, 'prova');
    expect(await postiDi(lampugnano.id)).toBe(2);
    expect(await postiDi(famagosta.id)).toBe(0);
  });

  it('i posti in vendita e la soglia minima si contano per fermata', async () => {
    const { evento, tragitto, lampugnano, famagosta } = await tragittoConDueMilano();
    await db.update(fermate).set({ sogliaMinima: 5 }).where(eq(fermate.id, lampugnano.id));
    await db.update(fermate).set({ sogliaMinima: 5 }).where(eq(fermate.id, famagosta.id));
    const cliente = await creaCliente();
    await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: lampugnano.id }, cliente, { passeggeri: 3 }), cliente.id);

    const opzioni = await eventiService.opzioniPartenza(evento.id);
    const perLampugnano = opzioni.find((o) => o.fermataId === lampugnano.id)!;
    const perFamagosta = opzioni.find((o) => o.fermataId === famagosta.id)!;
    expect(perLampugnano.partecipantiAttuali).toBe(3);
    expect(perFamagosta.partecipantiAttuali).toBe(0);
    // Posti liberi: 10 - 3 su una, 10 sull'altra.
    expect(perLampugnano.postiDisponibili).toBe(7);
    expect(perFamagosta.postiDisponibili).toBe(10);
  });
});
