import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, linee, preventiviRichieste, preventiviRisposte, tragitti } from '../../db/schema.js';
import { preventiviService } from './preventivi.routes.js';
import { ricollegaPreventiviBus } from './preventivi-bus.service.js';
import { eventiService } from '../eventi/eventi.service.js';
import { creaBusSuLinea, creaEvento, creaFermata, creaFornitore, creaProposta, creaTragitto, svuotaDatabase } from '../../../test/dati.js';
import { posta, svuotaPosta } from '../../../test/posta.js';

// Quotazione indicativa per i prezzi e preventivo vero per ogni bus
// (deciso dal proprietario, settembre 2026).

const ROMA = { lat: 41.9, lng: 12.5 };

/** Tragitto in vendita con due fermate, una quotazione scelta (fornitore lontano)
 *  e due fornitori vicini a Roma: uno con invio automatico, uno manuale. */
async function scenario() {
  const evento = await creaEvento();
  const quotazione = await creaFornitore({ nome: 'Autolinee Milano', lat: 45.46, lng: 9.19 });
  const automatico = await creaFornitore({ nome: 'Bus Roma', lat: 41.91, lng: 12.49, invioAutomatico: true });
  const manuale = await creaFornitore({ nome: 'Viaggi Tivoli', lat: 41.96, lng: 12.8 });
  const tragitto = await creaTragitto(evento.id, { preventivoCosto: '1000', preventivoPostiBus: 50, fornitoreId: quotazione.id });
  const roma = await creaFermata(tragitto.id, { citta: 'Roma', orario: '08:00', ordine: 0 });
  const firenze = await creaFermata(tragitto.id, { citta: 'Firenze', orario: '10:00', ordine: 1 });
  const proposta = await creaProposta(tragitto.id, [roma.id, firenze.id]);
  return { evento, tragitto, roma, firenze, proposta, quotazione, automatico, manuale };
}

const richiesteDi = (lineaId: string) => db.select().from(preventiviRichieste).where(eq(preventiviRichieste.lineaId, lineaId));

async function rispondi(richiestaId: string, prezzo: number, postiBus = 54) {
  const [r] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.id, richiestaId));
  return preventiviService.rispondi(r.token, { prezzo, postiBus });
}

beforeEach(svuotaDatabase);

describe('preventivi per il bus di una proposta', () => {
  it('chi ha dato la quotazione è sempre tra i fornitori, in cima, anche se lontano', async () => {
    const s = await scenario();
    const candidati = await preventiviService.candidatiPerBus(s.proposta.id, ROMA.lat, ROMA.lng, 40);

    expect(candidati.map((c) => c.nome)).toEqual(['Autolinee Milano', 'Bus Roma', 'Viaggi Tivoli']);
    expect(candidati.map((c) => c.statoCandidato)).toEqual(['accettato_in_precedenza', 'automatico', 'manuale']);
  });

  it('la richiesta parte con le fermate del bus e la mail apposita', async () => {
    const s = await scenario();
    const esito = await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [s.quotazione.id] });

    expect(esito).toMatchObject({ inviateAutomatiche: 1, inviateManuali: 1 });
    const richieste = await richiesteDi(s.proposta.id);
    expect(richieste).toHaveLength(2);
    expect(richieste.every((r) => r.scopo === 'BUS' && r.fermateIds?.join() === [s.roma.id, s.firenze.id].join())).toBe(true);
    expect(posta.map((e) => e.oggetto)).toEqual(expect.arrayContaining([expect.stringContaining('Richiesta preventivo per un bus')]));
    expect(posta[0].html).toContain('Roma (08:00) → Firenze (10:00)');
  });

  it('un fornitore già contattato per questo bus non si può scegliere di nuovo', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [s.quotazione.id] });
    const candidati = await preventiviService.candidatiPerBus(s.proposta.id, ROMA.lat, ROMA.lng, 40);
    expect(candidati.find((c) => c.id === s.quotazione.id)?.statoCandidato).toBe('gia_contattato');
    expect(candidati.find((c) => c.id === s.automatico.id)?.statoCandidato).toBe('gia_contattato');
  });

  it('la pagina del fornitore mostra il bus e le sue fermate', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(s.proposta.id);
    const pagina = await preventiviService.getPubblico(richiesta.token);

    expect(pagina.scopo).toBe('BUS');
    expect(pagina.bus).toEqual({ nome: 'Linea 1', postiRiferimento: 50 });
    expect(pagina.fermate.map((f) => f.citta)).toEqual(['Roma', 'Firenze']);
    expect(pagina.giaAssegnato).toBe(false);
  });

  it('confermando il bus con un preventivo: fornitore del bus, tornata chiusa, mail a scelto e non scelti', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [s.quotazione.id] });
    const richieste = await richiesteDi(s.proposta.id);
    const perFornitore = (id: string) => richieste.find((r) => r.fornitoreId === id)!;
    const scelta = await rispondi(perFornitore(s.automatico.id).id, 900);
    await rispondi(perFornitore(s.quotazione.id).id, 950);
    svuotaPosta();

    const esito = await eventiService.confermaLinea(s.proposta.id, {
      riferimento: 'AB123CD', postiBus: 54, costo: 900, fermateIds: [s.roma.id, s.firenze.id], rispostaId: scelta.id,
    });

    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, esito.busId));
    expect(bus.fornitoreId).toBe(s.automatico.id);
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.id, scelta.id));
    expect(risposta.busId).toBe(esito.busId);
    const dopo = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, s.tragitto.id));
    expect(dopo.every((r) => r.chiusaIl !== null)).toBe(true);
    expect(esito.fornitoreSceltoAvvisato).toBe(true);
    expect(esito.fornitoriNonSceltiAvvisati).toBe(1);
    expect(posta.find((e) => e.a === s.automatico.email)?.oggetto).toContain('Preventivo accettato');
    expect(posta.find((e) => e.a === s.quotazione.email)?.oggetto).toContain('Aggiornamento');
  });

  it('dopo la conferma il fornitore non può più rispondere e il preventivo compare sul bus', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [s.quotazione.id] });
    const [prima, seconda] = await richiesteDi(s.proposta.id);
    const scelta = await rispondi(prima.id, 900);
    await eventiService.confermaLinea(s.proposta.id, { riferimento: 'AB123CD', postiBus: 54, fermateIds: [s.roma.id, s.firenze.id], rispostaId: scelta.id });

    await expect(preventiviService.rispondi(seconda.token, { prezzo: 800, postiBus: 50 })).rejects.toMatchObject({ statusCode: 409 });
    const lineeTragitto = await eventiService.listaLinee(s.tragitto.id);
    expect(lineeTragitto[0].bus[0].preventivo).toMatchObject({ rispostaId: scelta.id, prezzo: '900.00' });
  });

  it('bus in più su una linea che c\'è: il preventivo resta legato al bus anche se la proposta sparisce', async () => {
    const s = await scenario();
    // Linea già confermata con le stesse fermate: la proposta è un bus in più.
    await db.update(linee).set({ daConfermare: false, nome: 'Linea 1' }).where(eq(linee.id, s.proposta.id));
    await creaBusSuLinea(s.proposta.id, 50);
    const propostaBus = await creaProposta(s.tragitto.id, [s.roma.id, s.firenze.id], 'Bus 2 · Linea 1');
    await preventiviService.richiediBus(propostaBus.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(propostaBus.id);
    const scelta = await rispondi(richiesta.id, 880);

    const esito = await eventiService.confermaLinea(propostaBus.id, { riferimento: 'EF456GH', postiBus: 54, fermateIds: [s.roma.id, s.firenze.id], rispostaId: scelta.id });
    expect(esito.lineaId).toBe(s.proposta.id);
    const [risposta] = await db.select().from(preventiviRisposte).where(eq(preventiviRisposte.id, scelta.id));
    expect(risposta.busId).toBe(esito.busId);
  });

  it('il preventivo di un\'altra proposta non si può usare', async () => {
    const s = await scenario();
    const altra = await creaProposta(s.tragitto.id, [s.firenze.id], 'Linea 2');
    await preventiviService.richiediBus(altra.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(altra.id);
    const risposta = await rispondi(richiesta.id, 700);

    await expect(eventiService.confermaLinea(s.proposta.id, { riferimento: 'X', postiBus: 50, fermateIds: [s.roma.id, s.firenze.id], rispostaId: risposta.id }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('proposta sparita: il fornitore legge che il bus non serve più; se rinasce uguale, la richiesta torna valida', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(s.proposta.id);
    await db.delete(linee).where(eq(linee.id, s.proposta.id));

    const pagina = await preventiviService.getPubblico(richiesta.token);
    expect(pagina.giaAssegnato).toBe(true);
    expect(pagina.motivoChiusura).toContain('non serve più');

    const rinata = await creaProposta(s.tragitto.id, [s.roma.id, s.firenze.id]);
    await ricollegaPreventiviBus(db, s.tragitto.id, rinata.id, [s.roma.id, s.firenze.id]);
    expect((await richiesteDi(rinata.id)).map((r) => r.id)).toEqual([richiesta.id]);
    expect((await preventiviService.getPubblico(richiesta.token)).giaAssegnato).toBe(false);
  });

  it('file firmato: si manda per il preventivo del bus scelto', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(s.proposta.id);
    const scelta = await rispondi(richiesta.id, 900);
    await eventiService.confermaLinea(s.proposta.id, { riferimento: 'AB123CD', postiBus: 54, fermateIds: [s.roma.id, s.firenze.id], rispostaId: scelta.id });
    svuotaPosta();

    const { inviata } = await preventiviService.caricaFileFirmato(scelta.id, 'firmato.pdf', Buffer.from('%PDF-prova').toString('base64'));
    expect(inviata).toBe(true);
    expect(posta[0].allegati).toHaveLength(1);
  });
});

describe('quotazione del tragitto', () => {
  async function conRispostaDiQuotazione() {
    const evento = await creaEvento();
    const fornitore = await creaFornitore({ lat: 41.91, lng: 12.49 });
    const tragitto = await creaTragitto(evento.id, { stato: 'DA_CONFERMARE' });
    await creaFermata(tragitto.id, { citta: 'Roma', orario: '08:00' });
    await preventiviService.richiedi(tragitto.id, { ...ROMA, fornitoriManualiIds: [fornitore.id] });
    const [richiesta] = await db.select().from(preventiviRichieste).where(eq(preventiviRichieste.tragittoId, tragitto.id));
    const risposta = await preventiviService.rispondi(richiesta.token, { prezzo: 1200, postiBus: 52 });
    return { tragitto, fornitore, risposta };
  }

  it('sceglierla fissa costo, posti e fornitore di riferimento, senza mandare email', async () => {
    const q = await conRispostaDiQuotazione();
    svuotaPosta();
    await preventiviService.accetta(q.risposta.id);

    const [t] = await db.select().from(tragitti).where(eq(tragitti.id, q.tragitto.id));
    expect(Number(t.preventivoCosto)).toBe(1200);
    expect(t.preventivoPostiBus).toBe(52);
    expect(t.fornitoreId).toBe(q.fornitore.id);
    expect(posta).toHaveLength(0);
  });

  it('niente file firmato per una quotazione', async () => {
    const q = await conRispostaDiQuotazione();
    await preventiviService.accetta(q.risposta.id);
    await expect(preventiviService.caricaFileFirmato(q.risposta.id, 'f.pdf', 'JVBERg==')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('una risposta per un bus non si sceglie come quotazione', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(s.proposta.id);
    const risposta = await rispondi(richiesta.id, 900);
    await expect(preventiviService.accetta(risposta.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('le richieste per i bus non finiscono tra quelle della quotazione', async () => {
    const s = await scenario();
    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [] });
    expect(await preventiviService.listaPerTragitto(s.tragitto.id)).toHaveLength(0);
    expect(await preventiviService.listaPerProposta(s.proposta.id)).toHaveLength(1);
  });

  it('elenco di Partenze: proposte senza richieste e risposte per i bus', async () => {
    const s = await scenario();
    let riga = (await eventiService.elencoPartenze()).find((p) => p.tragittoId === s.tragitto.id)!;
    expect(riga).toMatchObject({ proposteSenzaRichieste: 1, risposteBus: 0 });

    await preventiviService.richiediBus(s.proposta.id, { ...ROMA, fornitoriManualiIds: [] });
    const [richiesta] = await richiesteDi(s.proposta.id);
    await rispondi(richiesta.id, 900);
    riga = (await eventiService.elencoPartenze()).find((p) => p.tragittoId === s.tragitto.id)!;
    expect(riga).toMatchObject({ proposteSenzaRichieste: 0, risposteBus: 1, richiestePreventivo: 0 });
  });
});
