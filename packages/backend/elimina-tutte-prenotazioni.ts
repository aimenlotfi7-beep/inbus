// Elimina TUTTE le prenotazioni (e i loro partecipanti) e la lista
// d'attesa, riportando i posti disponibili di ogni tratta al totale
// originale — così puoi rifare test puliti senza vecchi dati in mezzo.
// NON tocca eventi, tragitti, utenti, tour leader, ecc. — solo le
// prenotazioni e la lista d'attesa.
//
// Uso: npx tsx elimina-tutte-prenotazioni.ts
// (richiede DATABASE_URL già impostata sull'ambiente giusto)
import { db } from './src/db/client.js';
import { prenotazioni, partecipantiPrenotazione, listaAttesa, lineeBus } from './src/db/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Elimino tutte le prenotazioni...');

  const [{ count: numPrenotazioni }] = await db.select({ count: sql<number>`count(*)::int` }).from(prenotazioni);
  const [{ count: numListaAttesa }] = await db.select({ count: sql<number>`count(*)::int` }).from(listaAttesa);

  await db.delete(partecipantiPrenotazione);
  await db.delete(prenotazioni);
  await db.delete(listaAttesa);

  // Riporta ogni tratta ad avere tutti i posti di nuovo liberi.
  await db.update(lineeBus).set({ postiDisponibili: sql`${lineeBus.postiTotali}` });

  console.log(`Fatto: eliminate ${numPrenotazioni} prenotazioni e ${numListaAttesa} iscrizioni alla lista d'attesa.`);
  console.log('Posti disponibili di tutte le tratte riportati al totale.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore:', err);
  process.exit(1);
});
