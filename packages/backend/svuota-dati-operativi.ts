// Cancella TUTTI i dati "operativi" del gestionale — eventi (e tutto il
// collegato: tratte, fermate, immagini, bus censiti, offerte), tutte le
// prenotazioni, la lista d'attesa, gli utenti/clienti, le campagne
// marketing, la chat, i fornitori, i tour leader e i promoter, e i
// tragitti salvati.
//
// NON tocca: account amministratori, ruoli e permessi, il testo delle
// pagine del sito (privacy/cookie/ecc), le impostazioni generali, il
// testo delle email automatiche — tutto l'assetto del gestionale resta
// intatto, viene svuotato solo il "contenuto".
//
// ATTENZIONE: operazione irreversibile, non c'è un "annulla". Chiede
// conferma esplicita prima di procedere.
//
// Uso: npx tsx svuota-dati-operativi.ts
// (richiede DATABASE_URL già impostata sull'ambiente giusto — attenzione
// a puntare al database GIUSTO prima di lanciarlo, specialmente in
// produzione)
import readline from 'node:readline/promises';
import { sql } from 'drizzle-orm';
import { db } from './src/db/client.js';
import {
  prenotazioni, partecipantiPrenotazione, listaAttesa,
  eventi, busFisici, utenti, campagne, fornitori, tourLeader, promoter, tragitti,
} from './src/db/schema.js';

async function conta(tabella: typeof eventi | typeof prenotazioni | typeof utenti | typeof campagne | typeof fornitori | typeof tourLeader | typeof promoter | typeof tragitti | typeof busFisici) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tabella);
  return n;
}

async function main() {
  const conteggi = {
    eventi: await conta(eventi),
    prenotazioni: await conta(prenotazioni),
    utenti: await conta(utenti),
    campagne: await conta(campagne),
    fornitori: await conta(fornitori),
    tourLeader: await conta(tourLeader),
    promoter: await conta(promoter),
    tragitti: await conta(tragitti),
    busFisici: await conta(busFisici),
  };

  console.log('\nQuesto script cancellerà TUTTO il seguente, senza possibilità di tornare indietro:\n');
  console.log(`  ${conteggi.eventi} eventi (e tratte, fermate, immagini, offerte collegate)`);
  console.log(`  ${conteggi.prenotazioni} prenotazioni (e la lista d'attesa)`);
  console.log(`  ${conteggi.utenti} utenti/clienti`);
  console.log(`  ${conteggi.campagne} campagne marketing`);
  console.log(`  ${conteggi.busFisici} bus censiti`);
  console.log(`  ${conteggi.fornitori} fornitori`);
  console.log(`  ${conteggi.tourLeader} tour leader`);
  console.log(`  ${conteggi.promoter} promoter`);
  console.log(`  ${conteggi.tragitti} tragitti salvati`);
  console.log('\nNON verranno toccati: account amministratori, ruoli/permessi, testo delle pagine del sito, impostazioni, testo delle email.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const risposta = await rl.question('Scrivi CANCELLA (tutto maiuscolo) per confermare, o premi Invio per annullare: ');
  rl.close();

  if (risposta.trim() !== 'CANCELLA') {
    console.log('Annullato — nessun dato è stato toccato.');
    process.exit(0);
  }

  console.log('\nCancello...');

  // Le prenotazioni vanno cancellate PRIMA degli eventi/utenti: non si
  // cancellano da sole insieme a loro (a differenza di lista d'attesa,
  // immagini, offerte, che invece seguono l'evento in automatico).
  await db.delete(partecipantiPrenotazione);
  await db.delete(prenotazioni);
  await db.delete(listaAttesa); // ridondante se già svuotata dalla cancellazione eventi, ma sicuro rieseguirla

  // Cancellando gli eventi si portano dietro in automatico: immagini,
  // allegati, tratte (e le loro fermate), offerte, chat, lista d'attesa,
  // collegamenti coi promoter.
  await db.delete(eventi);

  // I bus censiti NON si cancellano da soli insieme all'evento (restano
  // "orfani", senza più nessuna tratta a cui sono collegati) — vanno
  // tolti esplicitamente.
  await db.delete(busFisici);

  await db.delete(utenti);
  await db.delete(campagne);
  await db.delete(fornitori);
  await db.delete(tourLeader);
  await db.delete(promoter);
  await db.delete(tragitti);

  console.log('\nFatto. Il gestionale è pulito, pronto per partire davvero.');
  console.log('Restano intatti: account amministratori, ruoli/permessi, pagine del sito, impostazioni, testo email.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore:', err);
  process.exit(1);
});
