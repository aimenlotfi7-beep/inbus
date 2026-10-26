import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tragitti } from '../../db/schema.js';
import { aggiornaEventoSchema, creaEventoSchema } from './eventi.dto.js';
import { eventiService } from './eventi.service.js';
import { fraGiorni, svuotaDatabase } from '../../../test/dati.js';

// Ordine dei tragitti (proprietario, ottobre 2026): le linguette di Partenze
// cambiavano posto dopo ogni salvataggio. Ora l'ordine è quello della scheda
// evento e non cambia modificando un tragitto.

beforeEach(async () => {
  await svuotaDatabase();
});

const tragitto = (nome: string, id?: string) => ({
  ...(id && { id }), nome, postiTotali: 50,
  fermate: [{ citta: nome.split(' ')[0], indirizzo: 'Piazza della Stazione', orario: '08:00', prezzo: 30 }],
});

async function eventoConTreTragitti() {
  const id = await eventiService.create(creaEventoSchema.parse({
    artista: 'Ordine di prova', genere: 'Pop', luogo: 'Stadio', citta: 'Roma', data: fraGiorni(60).toISOString(),
    tragitti: [tragitto('Puglia → Roma'), tragitto('Como → Roma'), tragitto('Napoli → Roma')],
  }));
  return id;
}

const nomi = async (id: string) => (await eventiService.getById(id)).tragitti.map((t) => t.nome);

describe('ordine dei tragitti', () => {
  it('alla creazione è quello della scheda, non l\'alfabetico', async () => {
    const id = await eventoConTreTragitti();
    expect(await nomi(id)).toEqual(['Puglia → Roma', 'Como → Roma', 'Napoli → Roma']);
  });

  it('modificare un tragitto non lo sposta', async () => {
    const id = await eventoConTreTragitti();
    const [primo] = (await eventiService.getById(id)).tragitti;
    // Più modifiche di fila sul primo: prima finiva in fondo.
    for (const soglia of [40, null, 35]) await eventiService.impostaSogliaTragitto(primo.id, soglia);
    await db.update(tragitti).set({ preventivoCosto: '900' }).where(eq(tragitti.id, primo.id));
    expect(await nomi(id)).toEqual(['Puglia → Roma', 'Como → Roma', 'Napoli → Roma']);
    expect((await eventiService.calcolaBusNecessari(id)).map((t) => t.nome)).toEqual(['Puglia → Roma', 'Como → Roma', 'Napoli → Roma']);
  });

  it('salvando la scheda in un altro ordine, vale il nuovo', async () => {
    const id = await eventoConTreTragitti();
    const [puglia, como, napoli] = (await eventiService.getById(id)).tragitti;
    await eventiService.update(id, aggiornaEventoSchema.parse({
      tragitti: [tragitto('Napoli → Roma', napoli.id), tragitto('Puglia → Roma', puglia.id), tragitto('Como → Roma', como.id), tragitto('Bari → Roma')],
      servizi: [],
    }));
    expect(await nomi(id)).toEqual(['Napoli → Roma', 'Puglia → Roma', 'Como → Roma', 'Bari → Roma']);
  });

  it('anche i servizi e i loro tragitti restano nell\'ordine della scheda', async () => {
    const id = await eventiService.create(creaEventoSchema.parse({
      artista: 'Servizi di prova', genere: 'Pop', luogo: 'Stadio', citta: 'Roma', data: fraGiorni(60).toISOString(),
      servizi: [
        { nome: 'Arrivo alle 18', tragitti: [tragitto('Torino → Roma'), tragitto('Asti → Roma')] },
        { nome: 'Arrivo alle 14', tragitti: [tragitto('Verona → Roma')] },
      ],
    }));
    const evento = await eventiService.getById(id);
    expect(evento.servizi.map((s) => s.nome)).toEqual(['Arrivo alle 18', 'Arrivo alle 14']);
    expect(evento.servizi[0].tragitti.map((t) => t.nome)).toEqual(['Torino → Roma', 'Asti → Roma']);
  });
});
