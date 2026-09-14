import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { fermate, movimentiCredito, partecipantiPrenotazione, prenotazioni, tragitti, utenti } from '../../db/schema.js';
import { prenotazioniService } from './prenotazioni.service.js';
import { creaCoupon, creaFermata, fraGiorni, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';
import { posta } from '../../../test/posta.js';

// Prenotazioni: prezzi, acconto, saldo, posti e credito, con il database vero.

const leggi = async (pnr: string) => (await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)))[0];
const creditoDi = async (utenteId: string) => Number((await db.select().from(utenti).where(eq(utenti.id, utenteId)))[0].creditoDisponibile);
const postiLiberi = async (tragittoId: string) => (await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)))[0].postiDisponibili;

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('credito_per_passeggero', 0);
});

describe('pagamento completo', () => {
  it('2 passeggeri a Roma (40 €) più 5 € di extra della tratta: 90 €, posti tolti, un partecipante per passeggero', async () => {
    const s = await scenarioBase({ tragitto: { prezzoExtra: '5' } });
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 2 }), s.cliente.id);

    expect(Number(p.totale)).toBe(90);
    expect(Number(p.totalePrevisto)).toBe(90);
    expect(p.saldoPagato).toBe(true);
    expect(await postiLiberi(s.tragitto.id)).toBe(999999 - 2);
    const partecipanti = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.prenotazioneId, p.id));
    expect(partecipanti).toHaveLength(2);
  });

  it('parte subito la conferma di pagamento, senza biglietto allegato', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);

    expect(p.emailConfermaInviata).toBe(true);
    const email = posta.filter((e) => e.a === s.cliente.email);
    expect(email).toHaveLength(1);
    expect(email[0].allegati ?? []).toHaveLength(0);
  });

  it('il credito fedeltà matura subito, perché il pagamento è completo', async () => {
    await impostazione('credito_per_passeggero', 1.5);
    const s = await scenarioBase();
    await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 2 }), s.cliente.id);

    expect(await creditoDi(s.cliente.id)).toBe(3);
  });

  it('il credito disponibile copre il prezzo fino a dove arriva, mai oltre', async () => {
    const s = await scenarioBase();
    await db.update(utenti).set({ creditoDisponibile: '25' }).where(eq(utenti.id, s.cliente.id));
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { usaCredito: true }), s.cliente.id);

    expect(Number(p.creditoUsato)).toBe(25);
    expect(Number(p.totale)).toBe(15);
    expect(await creditoDi(s.cliente.id)).toBe(0);
    const movimenti = await db.select().from(movimentiCredito).where(eq(movimentiCredito.prenotazioneId, p.id));
    expect(movimenti.map((m) => Number(m.importo))).toEqual([-25]);
  });
});

describe('acconto per passeggero (deciso dal proprietario)', () => {
  it('acconto di 15 € per 3 passeggeri: si pagano 45 €, il prezzo intero di 120 € resta segnato', async () => {
    const s = await scenarioBase({ evento: { accontoEur: '15' } });
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 3, tipoPagamento: 'ACCONTO' }), s.cliente.id);

    expect(Number(p.totale)).toBe(45);
    expect(Number(p.totalePrevisto)).toBe(120);
    expect(p.saldoPagato).toBe(false);
  });

  it('senza acconto sull\'evento vale quello generale (10 €) per passeggero', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 2, tipoPagamento: 'ACCONTO' }), s.cliente.id);

    expect(Number(p.totale)).toBe(20);
  });

  it('l\'acconto non supera mai il prezzo intero', async () => {
    const s = await scenarioBase({ evento: { accontoEur: '50' } });
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.firenze.id }, s.cliente, { tipoPagamento: 'ACCONTO' }), s.cliente.id);

    expect(Number(p.totale)).toBe(30);
  });

  it('il saldo scade 15 giorni prima dell\'evento', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { tipoPagamento: 'ACCONTO' }), s.cliente.id);

    expect(p.scadenzaSaldo?.getTime()).toBe(s.evento.data.getTime() - 15 * 24 * 3600 * 1000);
  });

  it('a meno di 15 giorni dall\'evento l\'acconto non si può scegliere', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(10) } });
    await expect(
      prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { tipoPagamento: 'ACCONTO' }), s.cliente.id),
    ).rejects.toMatchObject({ code: 'ACCONTO_NON_DISPONIBILE' });
    expect(await postiLiberi(s.tragitto.id)).toBe(999999);
  });

  it('con l\'acconto niente biglietto e niente credito fedeltà', async () => {
    await impostazione('credito_per_passeggero', 2);
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { tipoPagamento: 'ACCONTO' }), s.cliente.id);

    const salvata = await leggi(p.pnr);
    expect(salvata.ticketStato).toBeNull();
    expect(salvata.creditoMaturato).toBe(false);
    expect(await creditoDi(s.cliente.id)).toBe(0);
  });

  it('il coupon non si usa con l\'acconto (si usa al saldo)', async () => {
    const s = await scenarioBase();
    await creaCoupon({ codice: 'SCONTO10', tipo: 'PERCENTUALE', valore: '10' });
    await expect(
      prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { tipoPagamento: 'ACCONTO', couponCodice: 'SCONTO10' }), s.cliente.id),
    ).rejects.toMatchObject({ code: 'COUPON_NON_VALIDO' });
  });
});

describe('saldo', () => {
  async function prenotazioneAdAcconto(passeggeri = 3) {
    const s = await scenarioBase({ evento: { accontoEur: '15' } });
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri, tipoPagamento: 'ACCONTO' }), s.cliente.id);
    return { ...s, p };
  }

  it('mancano 120 − 45 = 75 €', async () => {
    const { p, cliente } = await prenotazioneAdAcconto();
    const saldo = await prenotazioniService.differenzaSaldo(p.pnr, cliente.email);

    expect(saldo.accontoVersato).toBe(45);
    expect(saldo.totaleReale).toBe(120);
    expect(saldo.differenza).toBe(75);
  });

  it('pagato il saldo: totale 120 €, biglietto registrato, credito maturato solo adesso', async () => {
    await impostazione('credito_per_passeggero', 1);
    const { p, cliente } = await prenotazioneAdAcconto();
    expect(await creditoDi(cliente.id)).toBe(0);

    await prenotazioniService.saldaResto(p.pnr, cliente.email);
    const salvata = await leggi(p.pnr);
    expect(Number(salvata.totale)).toBe(120);
    expect(salvata.saldoPagato).toBe(true);
    expect(salvata.ticketStato).toBe('EMESSO');
    expect(await creditoDi(cliente.id)).toBe(3);
  });

  it('il prezzo del saldo è quello fissato all\'acquisto, anche se poi la fermata cambia prezzo', async () => {
    const { p, cliente, roma } = await prenotazioneAdAcconto();
    await db.update(fermate).set({ prezzo: '55' }).where(eq(fermate.id, roma.id));

    await prenotazioniService.saldaResto(p.pnr, cliente.email);
    expect(Number((await leggi(p.pnr)).totale)).toBe(120);
  });

  it('saldo con coupon del 20%: si pagano 96 €, lo sconto di 24 € resta scritto e l\'uso è contato', async () => {
    const { p, cliente } = await prenotazioneAdAcconto();
    await creaCoupon({ codice: 'SALDO20', tipo: 'PERCENTUALE', valore: '20' });

    await prenotazioniService.saldaResto(p.pnr, cliente.email, 'SALDO20');
    const salvata = await leggi(p.pnr);
    expect(Number(salvata.totale)).toBe(96);
    expect(Number(salvata.sconto)).toBe(24);
    expect(salvata.couponCodice).toBe('SALDO20');
  });

  it('un secondo "paga il saldo" non cambia nulla e non rimanda email', async () => {
    const { p, cliente } = await prenotazioneAdAcconto();
    await prenotazioniService.saldaResto(p.pnr, cliente.email);
    const emailDopoIlPrimo = posta.length;

    await prenotazioniService.saldaResto(p.pnr, cliente.email);
    expect(Number((await leggi(p.pnr)).totale)).toBe(120);
    expect(posta.length).toBe(emailDopoIlPrimo);
  });

  it('con un\'email diversa da quella della prenotazione il saldo non si trova', async () => {
    const { p } = await prenotazioneAdAcconto();
    await expect(prenotazioniService.saldaResto(p.pnr, 'altra.persona@example.com')).rejects.toMatchObject({ statusCode: 404 });
    expect((await leggi(p.pnr)).saldoPagato).toBe(false);
  });

  it('una prenotazione cancellata non si può saldare', async () => {
    const { p, cliente } = await prenotazioneAdAcconto();
    await prenotazioniService.cancella(p.pnr, 'Prova');
    await expect(prenotazioniService.saldaResto(p.pnr, cliente.email)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('si vende solo quello che è davvero in vendita', () => {
  const tentativo = async (s: Awaited<ReturnType<typeof scenarioBase>>, fermataId = s.roma.id) =>
    prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId }, s.cliente), s.cliente.id);

  it('evento in bozza', async () => {
    const s = await scenarioBase({ evento: { bozza: true } });
    await expect(tentativo(s)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('evento nel cestino', async () => {
    const s = await scenarioBase({ evento: { eliminatoIl: new Date() } });
    await expect(tentativo(s)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('evento già passato', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(-1) } });
    await expect(tentativo(s)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('il giorno dell\'evento si vende ancora', async () => {
    const s = await scenarioBase({ evento: { data: fraGiorni(0) } });
    await expect(tentativo(s)).resolves.toMatchObject({ stato: 'CONFERMATA' });
  });

  it('vendite fermate dal gestionale', async () => {
    const s = await scenarioBase({ evento: { venditeFermate: true } });
    await expect(tentativo(s)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('tragitto ancora da confermare', async () => {
    const s = await scenarioBase({ tragitto: { stato: 'DA_CONFERMARE' } });
    await expect(tentativo(s)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('tragitto disattivato', async () => {
    const s = await scenarioBase({ tragitto: { attivo: false } });
    await expect(tentativo(s)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fermata spenta', async () => {
    const s = await scenarioBase();
    const spenta = await creaFermata(s.tragitto.id, { citta: 'Orvieto', attivo: false });
    await expect(tentativo(s, spenta.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fermata senza prezzo', async () => {
    const s = await scenarioBase();
    const senzaPrezzo = await creaFermata(s.tragitto.id, { citta: 'Orvieto', prezzo: null });
    await expect(tentativo(s, senzaPrezzo.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fermata di un altro tragitto', async () => {
    const s = await scenarioBase();
    const altro = await scenarioBase();
    await expect(tentativo(s, altro.roma.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('dopo un rifiuto nessun posto resta bloccato', async () => {
    const s = await scenarioBase({ tragitto: { stato: 'DA_CONFERMARE' } });
    await expect(tentativo(s)).rejects.toThrow();
    expect(await postiLiberi(s.tragitto.id)).toBe(999999);
  });
});

describe('posti e cancellazioni', () => {
  it('una fermata con 2 posti rifiuta un gruppo da 3 e non tiene occupati i posti del bus', async () => {
    const s = await scenarioBase();
    await db.update(fermate).set({ postiMax: 2 }).where(eq(fermate.id, s.roma.id));

    await expect(
      prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 3 }), s.cliente.id),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await postiLiberi(s.tragitto.id)).toBe(999999);
  });

  it('la cancellazione restituisce i posti una volta sola, anche se ripetuta', async () => {
    const s = await scenarioBase();
    await db.update(fermate).set({ postiMax: 10 }).where(eq(fermate.id, s.roma.id));
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 4 }), s.cliente.id);
    expect(await postiLiberi(s.tragitto.id)).toBe(999999 - 4);

    const prima = await prenotazioniService.cancella(p.pnr, 'Prova');
    const seconda = await prenotazioniService.cancella(p.pnr, 'Prova');
    expect(prima.appenaCancellata).toBe(true);
    expect(seconda.appenaCancellata).toBe(false);
    expect(await postiLiberi(s.tragitto.id)).toBe(999999);
    expect((await db.select().from(fermate).where(eq(fermate.id, s.roma.id)))[0].postiPrenotati).toBe(0);
  });

  it('due cancellazioni nello stesso istante liberano i posti una volta sola', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente, { passeggeri: 2 }), s.cliente.id);

    const esiti = await Promise.all([prenotazioniService.cancella(p.pnr, 'A'), prenotazioniService.cancella(p.pnr, 'B')]);
    expect(esiti.filter((e) => e.appenaCancellata)).toHaveLength(1);
    expect(await postiLiberi(s.tragitto.id)).toBe(999999);
  });

  it('solo una prenotazione già cancellata si elimina per sempre', async () => {
    const s = await scenarioBase();
    const p = await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, s.cliente), s.cliente.id);
    await expect(prenotazioniService.eliminaDefinitivamente(p.pnr)).rejects.toMatchObject({ statusCode: 409 });
  });
});
