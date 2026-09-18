import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupon, fermate, listaAttesa, movimentiCredito, offerteEvento, prenotazioni, servizi, tragitti, utenti } from '../../db/schema.js';
import { prenotazioniService } from './prenotazioni.service.js';
import { creditoService } from '../credito/credito.service.js';
import { listaAttesaService } from '../lista-attesa/lista-attesa.service.js';
import { clienteAuthService } from '../cliente-auth/cliente-auth.service.js';
import { eventiService } from '../eventi/eventi.service.js';
import { aggiornaEventoSchema } from '../eventi/eventi.dto.js';
import { creaPrenotazioneSchema } from './prenotazioni.dto.js';
import { creaCouponSchema } from '../coupon/coupon.dto.js';
import { creaCliente, creaCoupon, creaEvento, creaFermata, creaLineaConBus, creaTragitto, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Controllo della logica (settembre 2026): i casi in cui due richieste
// arrivano insieme, la stessa richiesta arriva due volte o i dati sono
// manipolati. Ogni volta: niente prenotazioni doppie, niente contatori
// oltre il limite o sotto zero, niente mezze operazioni.

beforeEach(svuotaDatabase);

const chiave = (n: number) => `prova-chiave-richiesta-${n}-${Date.now()}`;
const esiti = <T>(promesse: Promise<T>[]) => Promise.allSettled(promesse);
const riuscite = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === 'fulfilled').length;

async function contaPrenotazioni(utenteId: string) {
  return (await db.select({ id: prenotazioni.id }).from(prenotazioni).where(eq(prenotazioni.utenteId, utenteId))).length;
}

describe('stessa richiesta due volte (doppio clic, ripetizione dopo un timeout)', () => {
  it('con la stessa chiave nasce una prenotazione sola, anche se le richieste arrivano insieme', async () => {
    const { evento, tragitto, roma, cliente } = await scenarioBase();
    const input = riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente, { passeggeri: 2, chiaveRichiesta: chiave(1) });

    const [a, b] = await Promise.all([prenotazioniService.crea(input, cliente.id), prenotazioniService.crea(input, cliente.id)]);
    expect(a.pnr).toBe(b.pnr);
    // E ripetuta più tardi: sempre la stessa.
    expect((await prenotazioniService.crea(input, cliente.id)).pnr).toBe(a.pnr);
    expect(await contaPrenotazioni(cliente.id)).toBe(1);
    const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragitto.id));
    expect(t.postiDisponibili).toBe(999999 - 2);
  });

  it('senza chiave, o con chiavi diverse, sono acquisti diversi', async () => {
    const { evento, tragitto, roma, cliente } = await scenarioBase();
    const dove = { eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id };
    await prenotazioniService.crea(riga(dove, cliente, { chiaveRichiesta: chiave(2) }), cliente.id);
    await prenotazioniService.crea(riga(dove, cliente, { chiaveRichiesta: chiave(3) }), cliente.id);
    await prenotazioniService.crea(riga(dove, cliente), cliente.id);
    expect(await contaPrenotazioni(cliente.id)).toBe(3);
  });

  it('una richiesta fallita (posti finiti) non occupa la chiave: riprovando si prenota', async () => {
    const { evento, tragitto, cliente } = await scenarioBase();
    const fermataPiena = await creaFermata(tragitto.id, { citta: 'Orte', prezzo: '20', postiMax: 1, ordine: 2 });
    const input = riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: fermataPiena.id }, cliente, { passeggeri: 2, chiaveRichiesta: chiave(4) });
    await expect(prenotazioniService.crea(input, cliente.id)).rejects.toThrow(/Posti non più disponibili/);
    await db.update(fermate).set({ postiMax: 5 }).where(eq(fermate.id, fermataPiena.id));
    expect((await prenotazioniService.crea(input, cliente.id)).pnr).toBeTruthy();
  });

  it("un ordine (carrello) ripetuto con la stessa chiave è un ordine solo", async () => {
    const { evento, tragitto, roma, firenze, cliente } = await scenarioBase();
    const articoli = [
      riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente),
      riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: firenze.id }, cliente),
    ];
    const k = chiave(5);
    const [a, b] = await Promise.all([
      prenotazioniService.creaOrdine(articoli, cliente.id, undefined, undefined, { chiave: k }),
      prenotazioniService.creaOrdine(articoli, cliente.id, undefined, undefined, { chiave: k }),
    ]);
    expect(a.ordine.id).toBe(b.ordine.id);
    expect(await contaPrenotazioni(cliente.id)).toBe(2);
  });
});

describe('due clienti sull\'ultimo posto', () => {
  it('una fermata con un posto solo: una prenotazione passa, l\'altra no', async () => {
    const { evento, tragitto } = await scenarioBase();
    const fermata = await creaFermata(tragitto.id, { citta: 'Orte', prezzo: '20', postiMax: 1, ordine: 2 });
    const clienti = await Promise.all([creaCliente(), creaCliente(), creaCliente()]);
    const risultati = await esiti(clienti.map((c) => prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: fermata.id }, c), c.id)));
    expect(riuscite(risultati)).toBe(1);
    const [f] = await db.select().from(fermate).where(eq(fermate.id, fermata.id));
    expect(f.postiPrenotati).toBe(1);
  });
});

describe('coupon, offerte e credito usati insieme', () => {
  it('un coupon con un uso solo, usato da tre clienti insieme: vale una volta', async () => {
    const { evento, tragitto, roma } = await scenarioBase();
    await creaCoupon({ codice: 'UNAVOLTA', tipo: 'FISSO', valore: '5', usiMax: 1 });
    const clienti = await Promise.all([creaCliente(), creaCliente(), creaCliente()]);
    const risultati = await esiti(clienti.map((c) => prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, c, { couponCodice: 'UNAVOLTA' }), c.id)));
    expect(riuscite(risultati)).toBe(1);
    const [c] = await db.select().from(coupon).where(eq(coupon.codice, 'UNAVOLTA'));
    expect(c.usiAttuali).toBe(1);
  });

  it("un'offerta con un utilizzo solo, usata insieme: vale una volta", async () => {
    const { evento, tragitto, roma } = await scenarioBase();
    const [offerta] = await db.insert(offerteEvento).values({ eventoId: evento.id, nome: 'Prova', slug: 'prova-offerta', scontoPercentuale: '10', limiteUtilizzi: 1 }).returning();
    const clienti = await Promise.all([creaCliente(), creaCliente()]);
    const risultati = await esiti(clienti.map((c) => prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, c, { offertaId: offerta.id }), c.id)));
    expect(riuscite(risultati)).toBe(1);
    const [o] = await db.select().from(offerteEvento).where(eq(offerteEvento.id, offerta.id));
    expect(o.utilizzi).toBe(1);
  });

  it('il credito non si spende due volte con due prenotazioni insieme dello stesso cliente', async () => {
    const { evento, tragitto, roma, cliente } = await scenarioBase();
    await db.update(utenti).set({ creditoDisponibile: '30.00' }).where(eq(utenti.id, cliente.id));
    const input = (n: number) => riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente, { usaCredito: true, chiaveRichiesta: chiave(10 + n) });
    await esiti([prenotazioniService.crea(input(1), cliente.id), prenotazioniService.crea(input(2), cliente.id)]);

    const [u] = await db.select().from(utenti).where(eq(utenti.id, cliente.id));
    expect(Number(u.creditoDisponibile)).toBeGreaterThanOrEqual(0);
    const usato = (await db.select().from(prenotazioni).where(eq(prenotazioni.utenteId, cliente.id))).reduce((s, p) => s + Number(p.creditoUsato), 0);
    expect(usato).toBe(30);
    // Saldo e movimenti coincidono.
    const movimenti = await db.select().from(movimentiCredito).where(eq(movimentiCredito.utenteId, cliente.id));
    expect(30 + movimenti.reduce((s, m) => s + Number(m.importo), 0)).toBe(Number(u.creditoDisponibile));
  });

  it('il credito fedeltà di una prenotazione matura una volta sola, anche chiamato insieme', async () => {
    await impostazione('credito_per_passeggero', 2);
    const { evento, tragitto, roma, cliente } = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente, { passeggeri: 3 }), cliente.id);
    // La conferma di pagamento lo ha già maturato? Lo tolgo per ripartire da zero.
    await db.update(prenotazioni).set({ creditoMaturato: false }).where(eq(prenotazioni.id, p.id));
    await db.delete(movimentiCredito).where(eq(movimentiCredito.prenotazioneId, p.id));
    await db.update(utenti).set({ creditoDisponibile: '0' }).where(eq(utenti.id, cliente.id));

    await Promise.all([creditoService.maturaCreditoSubito(p.id), creditoService.maturaCreditoSubito(p.id), creditoService.maturaCreditoViaggiConclusi()]);
    const [u] = await db.select().from(utenti).where(eq(utenti.id, cliente.id));
    expect(Number(u.creditoDisponibile)).toBe(6);
  });
});

describe('lista d\'attesa', () => {
  it('la stessa persona iscritta due volte insieme allo stesso evento resta una volta in coda', async () => {
    const { evento } = await scenarioBase();
    const iscrizione = { eventoId: evento.id, passeggeri: 2, cliente: { email: 'Coda@Example.com', nome: 'Anna', cognome: 'Bianchi', telefono: '3331112222' }, partecipanti: [{ nome: 'Luca', cognome: 'Verdi' }] };
    const [a, b] = await Promise.all([listaAttesaService.iscriviti(iscrizione), listaAttesaService.iscriviti(iscrizione)]);
    expect(a.id).toBe(b.id);
    const righe = await db.select().from(listaAttesa).where(and(eq(listaAttesa.eventoId, evento.id), eq(listaAttesa.email, 'coda@example.com')));
    expect(righe).toHaveLength(1);
  });
});

describe('account di chi ha comprato come ospite', () => {
  it('registrarsi con la sua email non mette la password di chi scrive, né cambia i suoi dati', async () => {
    const ospite = await creaCliente({ nome: 'Vera', cognome: 'Cliente', dataNascita: new Date('1990-05-01') });
    await clienteAuthService.registrati({
      email: ospite.email.toUpperCase(), password: 'password-di-un-altro', nome: 'Altro', cognome: 'Nome', dataNascita: new Date('2001-01-01'),
    });
    const [dopo] = await db.select().from(utenti).where(eq(utenti.id, ospite.id));
    expect(dopo.passwordHash).toBeNull();
    expect(dopo).toMatchObject({ nome: 'Vera', cognome: 'Cliente' });
    expect(dopo.dataNascita?.toISOString().slice(0, 10)).toBe('1990-05-01');
    // Il link per scegliere la password va a chi legge quella casella.
    expect(dopo.tokenResetPassword).toBeTruthy();
  });

  it('un acquisto da ospite con la sua email non gli cambia nome e data di nascita', async () => {
    const ospite = await creaCliente({ nome: 'Vera', cognome: 'Cliente', dataNascita: new Date('1990-05-01') });
    await clienteAuthService.trovaOCreaUtenteOspite({ email: ospite.email, nome: 'Altro', cognome: 'Nome', dataNascita: new Date('2001-01-01') });
    const [dopo] = await db.select().from(utenti).where(eq(utenti.id, ospite.id));
    expect(dopo).toMatchObject({ nome: 'Vera', cognome: 'Cliente' });
    expect(dopo.dataNascita?.toISOString().slice(0, 10)).toBe('1990-05-01');
  });
});

describe('bus e servizi cambiati dopo le vendite', () => {
  it('da due servizi a uno: il tragitto spostato resta lo stesso, con la sua prenotazione', async () => {
    const evento = await creaEvento();
    const [servizioA] = await db.insert(servizi).values({ eventoId: evento.id, nome: 'Pomeriggio' }).returning();
    const [servizioB] = await db.insert(servizi).values({ eventoId: evento.id, nome: 'Sera' }).returning();
    await creaTragitto(evento.id, { servizioId: servizioA.id, nome: 'Da Roma' });
    const tragittoB = await creaTragitto(evento.id, { servizioId: servizioB.id, nome: 'Da Milano' });
    const fermataB = await creaFermata(tragittoB.id, { citta: 'Milano', indirizzo: 'Piazza Duomo', orario: '09:00', prezzo: '30' });
    const cliente = await creaCliente();
    const p = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragittoB.id, fermataId: fermataB.id }, cliente), cliente.id);

    await eventiService.update(evento.id, aggiornaEventoSchema.parse({
      tragitti: [{ id: tragittoB.id, nome: 'Da Milano', postiTotali: 999999, fermate: [{ citta: 'Milano', indirizzo: 'Piazza Duomo', orario: '09:00', prezzo: 30 }] }],
      servizi: [],
    }));

    const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoB.id));
    expect(t).toMatchObject({ servizioId: null, eliminatoIl: null });
    const [ancora] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, p.id));
    expect(ancora.stato).toBe('CONFERMATA');
    expect(await db.select().from(servizi).where(eq(servizi.eventoId, evento.id))).toHaveLength(0);
  });

  it('posti del bus abbassati: scendono i gruppi in più (i più giovani), mai divisi', async () => {
    const { evento, tragitto, roma } = await scenarioBase();
    const { bus } = await creaLineaConBus(tragitto.id, [roma.id], 50);
    const adulto = await creaCliente({ dataNascita: new Date('1970-01-01') });
    const giovane = await creaCliente({ dataNascita: new Date('2005-01-01') });
    const pAdulto = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, adulto, { passeggeri: 2 }), adulto.id);
    const pGiovane = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, giovane, { passeggeri: 2 }), giovane.id);
    await db.update(prenotazioni).set({ busId: bus.id }).where(eq(prenotazioni.tragittoId, tragitto.id));

    await eventiService.aggiornaBusDiLinea(bus.id, { postiBus: 3 });
    const assegnate = await db.select().from(prenotazioni).where(eq(prenotazioni.busId, bus.id));
    expect(assegnate.map((p) => p.id)).toEqual([pAdulto.id]);
    expect(pGiovane.id).not.toBe(pAdulto.id);
  });

  it('una fermata tolta dalla linea: chi sale lì lascia quel bus', async () => {
    const { evento, tragitto, roma, firenze, cliente } = await scenarioBase();
    const { linea, bus } = await creaLineaConBus(tragitto.id, [roma.id, firenze.id], 50);
    const daFirenze = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: firenze.id }, cliente), cliente.id);
    const daRoma = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, cliente), cliente.id);
    await db.update(prenotazioni).set({ busId: bus.id }).where(eq(prenotazioni.tragittoId, tragitto.id));

    await eventiService.aggiornaPercorsoLinea(evento.id, linea.id, [roma.id]);
    const [f] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, daFirenze.id));
    const [r] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, daRoma.id));
    expect(f.busId).toBeNull();
    expect(r.busId).toBe(bus.id);
  });
});

describe('dati manipolati', () => {
  it('passeggeri a 0, negativi, enormi o come testo: rifiutati; il prezzo non si può mandare', () => {
    const base = { eventoId: 'e', tragittoId: 't', fermataId: 'f', cliente: { email: 'a@b.it', nome: 'A', cognome: 'B', telefono: '3330000' }, partecipanti: [] };
    for (const passeggeri of [0, -1, 1000, 1.5, '2', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(creaPrenotazioneSchema.safeParse({ ...base, passeggeri }).success).toBe(false);
    }
    // Un campo "totale" o "prezzo" nella richiesta non esiste per il server: si ignora.
    const conPrezzo = creaPrenotazioneSchema.parse({ ...base, passeggeri: 1, totale: 1, prezzo: 1 });
    expect(conPrezzo).not.toHaveProperty('totale');
    expect(conPrezzo).not.toHaveProperty('prezzo');
    // Partecipanti che non tornano con i passeggeri.
    expect(creaPrenotazioneSchema.safeParse({ ...base, passeggeri: 3, partecipanti: [] }).success).toBe(false);
    // Una chiave della richiesta strana.
    expect(creaPrenotazioneSchema.safeParse({ ...base, passeggeri: 1, chiaveRichiesta: 'corta' }).success).toBe(false);
  });

  it('un coupon in percentuale oltre il 100% non si crea', () => {
    expect(creaCouponSchema.safeParse({ codice: 'TROPPO', tipo: 'PERCENTUALE', valore: 150 }).success).toBe(false);
    expect(creaCouponSchema.safeParse({ codice: 'GIUSTO', tipo: 'PERCENTUALE', valore: 100 }).success).toBe(true);
    expect(creaCouponSchema.safeParse({ codice: 'FISSO200', tipo: 'FISSO', valore: 200 }).success).toBe(true);
  });

  it('il database rifiuta credito, usi e posti sotto zero anche se il codice sbagliasse', async () => {
    const cliente = await creaCliente();
    await expect(db.update(utenti).set({ creditoDisponibile: '-1' }).where(eq(utenti.id, cliente.id))).rejects.toThrow();
    const c = await creaCoupon({ codice: 'ZERO', tipo: 'FISSO', valore: '5' });
    await expect(db.update(coupon).set({ usiAttuali: -1 }).where(eq(coupon.id, c.id))).rejects.toThrow();
    const { tragitto } = await scenarioBase();
    await expect(db.update(tragitti).set({ postiDisponibili: -1 }).where(eq(tragitti.id, tragitto.id))).rejects.toThrow();
  });
});
