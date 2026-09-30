// Script una tantum: svuota TUTTI i dati di prova prima del lancio vero,
// tenendo solo le anagrafiche che servono a ripartire (proprietario,
// 30/09/2026: "ripulisci tutto tranne fornitori, fermate e percorsi").
//
// Più ampio di azzera-tutto-test.ts: quello lasciava coupon, campagne,
// bundle, tour, promoter, organizzatori e tour leader.
//
// COSA VA VIA
// - Eventi e tutto quello che ci sta dentro (tragitti, fermate degli
//   eventi, linee, bus, servizi, lista d'attesa, chat, comunicazioni,
//   variazioni, preventivi, offerte, immagini e allegati, responsabili)
// - Prenotazioni, ordini, movimenti di credito, account cliente
// - Coupon e voucher, campagne
// - Bundle, Tour, White Label
// - Organizzatori, promoter, tour leader
// - Spese e pagamenti ai fornitori, registro attività, chiavi delle
//   richieste già eseguite
//
// COSA RESTA
// - Fornitori (e i loro campi extra)
// - Anagrafica Fermate
// - Percorsi salvati (con le loro fermate)
// - Le utenze del gestionale, i ruoli e i permessi (altrimenti non si
//   entrerebbe più), impostazioni, testi dei tooltip, modelli delle
//   email, layout del biglietto, pagine e contenuti del sito, categorie
//
// Uso, dalla cartella packages/backend:
//   npx tsx src/db/azzera-dati-prelancio.ts CONFERMO
// Attenzione: agisce sul database indicato da DATABASE_URL della
// cartella da cui lo lanci. Lo stampa prima di partire (senza password)
// e aspetta 8 secondi: Ctrl+C per fermarsi. NON si torna indietro.

import { sql } from 'drizzle-orm';
import { db } from './client.js';
import {
  eventi, prenotazioni, ordini, movimentiCredito, utenti, coupon, campagne,
  bundle, tour, whiteLabel, organizzatori, promoter, tourLeader,
  speseFornitore, pagamentiFornitore, logAttivita, richiesteIdempotenti,
  fornitori, fermateAnagrafica, percorsiSalvati, amministratori,
} from './schema.js';

/** Quante righe ha una tabella, con l'etichetta da mostrare. */
async function conta(tabella: Parameters<ReturnType<typeof db.select>['from']>[0], nome: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tabella);
  return { nome, n };
}

async function main() {
  if (process.argv[2] !== 'CONFERMO') {
    console.error('Uso: npx tsx src/db/azzera-dati-prelancio.ts CONFERMO');
    console.error('(CANCELLA DAVVERO eventi, prenotazioni, clienti, coupon, campagne, bundle, tour, organizzatori, promoter, tour leader e pagamenti fornitori. Non si torna indietro.)');
    process.exit(1);
  }

  const indirizzo = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]+@/, '//***@');
  console.log(`Database: ${indirizzo || '(DATABASE_URL non impostata)'}`);
  if (!indirizzo) process.exit(1);

  const prima = await Promise.all([
    conta(eventi, 'eventi'), conta(prenotazioni, 'prenotazioni'), conta(ordini, 'ordini'),
    conta(utenti, 'clienti'), conta(movimentiCredito, 'movimenti di credito'), conta(coupon, 'coupon/voucher'),
    conta(campagne, 'campagne'), conta(bundle, 'bundle'), conta(tour, 'tour'), conta(whiteLabel, 'White Label'),
    conta(organizzatori, 'organizzatori'), conta(promoter, 'promoter'), conta(tourLeader, 'tour leader'),
    conta(speseFornitore, 'spese fornitori'), conta(logAttivita, 'righe del registro attività'),
  ]);
  console.log('Da cancellare: ' + prima.filter((r) => r.n > 0).map((r) => `${r.n} ${r.nome}`).join(', ') || 'niente');

  const restano = await Promise.all([
    conta(fornitori, 'fornitori'), conta(fermateAnagrafica, 'fermate in anagrafica'),
    conta(percorsiSalvati, 'percorsi salvati'), conta(amministratori, 'utenze del gestionale'),
  ]);
  console.log('Restano: ' + restano.map((r) => `${r.n} ${r.nome}`).join(', '));

  console.log('Procedo tra 8 secondi — Ctrl+C per annullare.');
  await new Promise((r) => setTimeout(r, 8000));

  // Tutto in una transazione: se una riga non si cancella, non si
  // cancella niente (meglio riprovare che restare a metà).
  await db.transaction(async (tx) => {
    // Prima i soldi verso i fornitori: le spese puntano a bus ed eventi.
    await tx.delete(pagamentiFornitore);
    await tx.delete(speseFornitore);

    // Prenotazioni e ordini bloccano sia gli eventi sia i clienti
    // (nessuna cancellazione a cascata su quei due campi, per scelta).
    await tx.delete(prenotazioni);
    await tx.delete(ordini);
    await tx.delete(movimentiCredito);

    // Gli eventi portano via a cascata tragitti, fermate, linee, bus,
    // servizi, lista d'attesa, chat, comunicazioni, variazioni,
    // preventivi, offerte, immagini, allegati e responsabili.
    await tx.delete(eventi);
    await tx.delete(utenti);

    // Codici sconto e campagne.
    await tx.delete(coupon);
    await tx.delete(campagne);

    // Contenitori e vendita per conto terzi.
    await tx.delete(whiteLabel);
    await tx.delete(bundle);
    await tx.delete(tour);

    // Account di chi vende o accompagna (separati dai clienti).
    await tx.delete(organizzatori);
    await tx.delete(promoter);
    await tx.delete(tourLeader);

    // Storico interno.
    await tx.delete(logAttivita);
    await tx.delete(richiesteIdempotenti);
  });

  const dopo = await Promise.all([
    conta(eventi, 'eventi'), conta(prenotazioni, 'prenotazioni'), conta(utenti, 'clienti'),
    conta(coupon, 'coupon/voucher'), conta(organizzatori, 'organizzatori'),
    conta(fornitori, 'fornitori'), conta(fermateAnagrafica, 'fermate in anagrafica'),
    conta(percorsiSalvati, 'percorsi salvati'), conta(amministratori, 'utenze del gestionale'),
  ]);
  console.log('Fatto. Adesso: ' + dopo.map((r) => `${r.n} ${r.nome}`).join(', '));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
