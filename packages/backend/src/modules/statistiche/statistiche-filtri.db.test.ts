import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/client.js';
import { tour, tourEventi } from '../../db/schema.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { SENZA_CATEGORIA } from './filtro-eventi.js';
import { aggiungiGiorni, costruisciPeriodo, oggiRoma, scriviGiorno } from './periodo.js';
import { statisticheService } from './statistiche.service.js';
import { creaCliente, fraGiorni, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// Filtri delle Statistiche (proprietario, ottobre 2026): categoria, genere,
// città, tour ed evento valgono per tutte le schede; «Rock» e « rock » sono
// lo stesso genere. Confronto: gli eventi del periodo divisi per gruppo.

beforeEach(async () => {
  await svuotaDatabase();
  await impostazione('credito_per_passeggero', 0);
});

/** Tre eventi tra 60 giorni: A Rock/Concerti/Milano (2 da Roma, 80 €), B « rock »/Festival/Roma (3 da Firenze, 90 €), C Pop senza categoria (1 da Roma, 40 €). */
async function treEventi() {
  const a = await scenarioBase({ evento: { genere: 'Rock', categoria: 'Concerti', citta: 'Milano' } });
  const b = await scenarioBase({ evento: { genere: ' rock ', categoria: 'Festival', citta: 'Roma' } });
  const c = await scenarioBase({ evento: { genere: 'Pop', categoria: null, citta: 'Milano' } });
  const prenota = async (s: typeof a, fermataId: string, passeggeri: number) => {
    const cliente = await creaCliente();
    await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId }, cliente, { passeggeri }), cliente.id);
  };
  await prenota(a, a.roma.id, 2);
  await prenota(b, b.firenze.id, 3);
  await prenota(c, c.roma.id, 1);
  return { a, b, c };
}

const oggi = oggiRoma();
/** Le prenotazioni fatte oggi. */
const venduteOggi = () => costruisciPeriodo(scriviGiorno(aggiungiGiorni(oggi, -1)), scriviGiorno(oggi), 'nessuno');
/** Gli eventi tra 60 giorni (creaEvento li mette lì). */
const eventiTra60 = () => costruisciPeriodo(scriviGiorno(aggiungiGiorni(oggi, 58)), scriviGiorno(aggiungiGiorni(oggi, 62)), 'nessuno');

describe('filtri sugli eventi', () => {
  it('il genere non guarda maiuscole né spazi', async () => {
    await treEventi();
    const vendite = await statisticheService.vendite(venduteOggi(), { genere: 'ROCK' });
    expect(vendite.fonti.reduce((s, f) => s + f.passeggeri, 0)).toBe(5);
    expect(vendite.fonti.reduce((s, f) => s + f.incasso, 0)).toBe(170);
  });

  it('categoria, città, «senza categoria» ed evento', async () => {
    const { a, c } = await treEventi();
    const passeggeri = async (fe: Parameters<typeof statisticheService.panoramica>[1]) =>
      (await statisticheService.panoramica(venduteOggi(), fe)).vendite.passeggeri.attuale;
    expect(await passeggeri({})).toBe(6);
    expect(await passeggeri({ categoria: 'festival' })).toBe(3);
    expect(await passeggeri({ citta: 'milano' })).toBe(3);
    expect(await passeggeri({ categoria: SENZA_CATEGORIA })).toBe(1);
    expect(await passeggeri({ eventoId: a.evento.id })).toBe(2);
    expect(await passeggeri({ genere: 'Pop', eventoId: a.evento.id })).toBe(0);
    expect((await statisticheService.panoramica(eventiTra60(), { eventoId: c.evento.id })).eventiDelPeriodo.eventi.attuale).toBe(1);
  });

  it('tour: solo gli eventi del tour', async () => {
    const { a } = await treEventi();
    const [t] = await db.insert(tour).values({ nome: 'Tour di prova', slug: 'tour-di-prova' }).returning();
    await db.insert(tourEventi).values({ tourId: t.id, eventoId: a.evento.id });
    const vendite = await statisticheService.vendite(venduteOggi(), { tourId: t.id });
    expect(vendite.fonti.reduce((s, f) => s + f.passeggeri, 0)).toBe(2);
    const opzioni = await statisticheService.opzioniFiltri();
    expect(opzioni.tour).toEqual([{ id: t.id, nome: 'Tour di prova' }]);
  });

  it('le voci dei filtri: un genere solo per «Rock» e « rock »', async () => {
    await treEventi();
    const opzioni = await statisticheService.opzioniFiltri();
    expect(opzioni.generi.map((g) => g.toLowerCase())).toEqual(['pop', 'rock']);
    expect(opzioni.categorie).toEqual(['Concerti', 'Festival']);
    expect(opzioni.senzaCategoria).toBe(true);
    expect(opzioni.citta).toEqual(['Milano', 'Roma']);
    expect(opzioni.eventi).toHaveLength(3);
  });
});

describe('confronto', () => {
  it('per genere: «Rock» e « rock » insieme, il totale conta ogni evento una volta', async () => {
    await treEventi();
    const risultato = await statisticheService.confronto(eventiTra60(), 'genere');
    const perNome = new Map(risultato.gruppi.map((g) => [g.nome.toLowerCase(), g]));
    expect(risultato.gruppi).toHaveLength(2);
    expect(perNome.get('rock')).toMatchObject({ eventi: 2, passeggeri: 5, incasso: 170, passeggeriPerEvento: 2.5 });
    expect(perNome.get('pop')).toMatchObject({ eventi: 1, passeggeri: 1, incasso: 40 });
    expect(risultato.totale).toMatchObject({ eventi: 3, passeggeri: 6, incasso: 210 });
    // Senza bus il costo manca: il margine è l'incasso e l'evento ha i costi incompleti.
    expect(perNome.get('rock')).toMatchObject({ margine: 170, eventiConCostiMancanti: 2, riempimento: null, marginePerPasseggero: 34 });
  });

  it('per categoria con «Senza categoria», e i filtri valgono anche qui', async () => {
    await treEventi();
    const tutte = await statisticheService.confronto(eventiTra60(), 'categoria');
    expect(tutte.gruppi.map((g) => g.nome).sort()).toEqual(['Concerti', 'Festival', 'Senza categoria']);
    const soloMilano = await statisticheService.confronto(eventiTra60(), 'categoria', { citta: 'Milano' });
    expect(soloMilano.gruppi.map((g) => g.nome).sort()).toEqual(['Concerti', 'Senza categoria']);
    expect(soloMilano.totale.passeggeri).toBe(3);
  });

  it('per mese: in ordine di calendario', async () => {
    await treEventi();
    const s = await scenarioBase({ evento: { data: fraGiorni(30) } });
    const cliente = await creaCliente();
    await prenotazioniService.crea(riga({ eventoId: s.evento.id, tragittoId: s.tragitto.id, fermataId: s.roma.id }, cliente, { passeggeri: 1 }), cliente.id);
    const periodo = costruisciPeriodo(scriviGiorno(aggiungiGiorni(oggi, 1)), scriviGiorno(aggiungiGiorni(oggi, 90)), 'nessuno');
    const risultato = await statisticheService.confronto(periodo, 'mese');
    const chiavi = risultato.gruppi.map((g) => g.chiave);
    expect(chiavi).toEqual([...chiavi].sort());
    expect(risultato.totale.eventi).toBe(4);
  });
});
