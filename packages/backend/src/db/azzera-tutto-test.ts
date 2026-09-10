// Script una tantum: azzera l'INTERO catalogo eventi e ogni account
// cliente prima di un vero lancio pubblico - da usare UNA VOLTA SOLA,
// quando si è certi che tutto sia di test. Molto più ampio dello
// script precedente (azzera-prenotazioni-test.ts, che toccava solo le
// prenotazioni lasciando eventi e utenti intatti) - qui va via anche
// il catalogo eventi e ogni account cliente.
//
// Cosa cancella:
// - Eventi (e a cascata: tragitti, fermate per tragitto, servizi,
//   lista d'attesa, righe di campagne collegate, variazioni annunciate)
// - Prenotazioni, ordini, movimenti di credito
// - Utenti (ogni account cliente - con loro sparisce anche tutto ciò
//   che "invita un amico" aveva scritto sui loro profili: codice
//   personale, chi ha invitato chi, bonus erogati - sono solo campi
//   sulla riga utente, non una tabella a sé)
//
// Cosa NON tocca (non richiesto, resta intatto):
// - Bundle e Tour: se contenevano solo eventi ora cancellati, restano
//   come contenitori vuoti (il collegamento si cancella a cascata, il
//   bundle/tour stesso no) - da ripulire a mano se non servono più
// - Coupon/voucher: restano (solo lo svincolo "assegnato a" si cancella,
//   il codice stesso no) - i contatori di utilizzo vengono comunque
//   azzerati, altrimenti mostrerebbero utilizzi di prenotazioni sparite
// - Promoter, organizzatori, tour leader, fornitori, amministratori:
//   account SEPARATI dagli utenti clienti, mai toccati da questo script
//
// Uso: npx tsx src/db/azzera-tutto-test.ts CONFERMO

import { sql } from 'drizzle-orm';
import { db } from './client.js';
import { prenotazioni, eventi, tragitti, coupon, utenti, movimentiCredito, ordini, listaAttesa } from './schema.js';

async function main() {
  if (process.argv[2] !== 'CONFERMO') {
    console.error('Uso: npx tsx src/db/azzera-tutto-test.ts CONFERMO');
    console.error('(il secondo argomento è voluto, per non lanciarlo per sbaglio - CANCELLA DAVVERO tutto: eventi, prenotazioni, crediti, utenti. Non si torna indietro.)');
    process.exit(1);
  }

  const [{ n: numEventi }] = await db.select({ n: sql<number>`count(*)::int` }).from(eventi);
  const [{ n: numTragitti }] = await db.select({ n: sql<number>`count(*)::int` }).from(tragitti);
  const [{ n: numPrenotazioni }] = await db.select({ n: sql<number>`count(*)::int` }).from(prenotazioni);
  const [{ n: numOrdini }] = await db.select({ n: sql<number>`count(*)::int` }).from(ordini);
  const [{ n: numMovimenti }] = await db.select({ n: sql<number>`count(*)::int` }).from(movimentiCredito);
  const [{ n: numUtenti }] = await db.select({ n: sql<number>`count(*)::int` }).from(utenti);
  const [{ n: numListaAttesa }] = await db.select({ n: sql<number>`count(*)::int` }).from(listaAttesa);

  console.log(`Trovati: ${numEventi} eventi, ${numTragitti} tragitti, ${numPrenotazioni} prenotazioni, ${numOrdini} ordini, ${numMovimenti} movimenti di credito, ${numListaAttesa} righe in lista d'attesa, ${numUtenti} utenti.`);
  if (numEventi === 0 && numUtenti === 0) {
    console.log('Niente da cancellare — il database è già pulito su questo fronte.');
    process.exit(0);
  }
  console.log('Procedo tra 5 secondi... (Ctrl+C ora per annullare — questa volta va via anche il catalogo eventi e ogni account cliente)');
  await new Promise((r) => setTimeout(r, 5000));

  await db.transaction(async (tx) => {
    // Ordine importante: prenotazioni e ordini bloccano sia eventi che
    // utenti (nessuna cascata automatica su quei due campi, per scelta
    // - servono per la contabilità in condizioni normali). Vanno via
    // per primi, altrimenti il resto fallirebbe con un errore di
    // vincolo.
    await tx.delete(prenotazioni);
    await tx.delete(ordini);
    await tx.delete(movimentiCredito);

    // Gli eventi - a cascata porta via tragitti, fermate per tragitto,
    // servizi, lista d'attesa, righe di campagne, variazioni. Bundle e
    // Tour restano (solo il collegamento a questi eventi sparisce).
    await tx.delete(eventi);

    // Gli utenti - ora sicuro, nessun ordine/prenotazione li blocca più.
    // Con loro sparisce anche tutto "invita un amico" (sono solo campi
    // sulla riga utente: codice personale, chi ha invitato chi, bonus
    // erogati - non c'è una tabella a parte da svuotare a parte).
    await tx.delete(utenti);

    // I coupon restano (non richiesto cancellarli), ma i loro contatori
    // di utilizzo ora mentirebbero (contano prenotazioni appena sparite)
    // - azzerati per coerenza, stessa cura dello script precedente.
    await tx.update(coupon).set({ usiAttuali: 0 });
  });

  console.log('Fatto — eventi, tragitti, prenotazioni, ordini, movimenti di credito e utenti cancellati; contatori coupon azzerati.');
  console.log('Bundle e Tour restano (ora vuoti, se contenevano solo eventi cancellati) - ripulisci a mano se non servono più.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
