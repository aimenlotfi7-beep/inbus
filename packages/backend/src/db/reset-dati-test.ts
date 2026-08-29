import postgres from 'postgres';
import { env } from '../config/env.js';
import readline from 'node:readline/promises';

/**
 * Svuota tutti i dati "di prova" (eventi, prenotazioni, bus, utenti
 * clienti, fornitori, percorsi salvati, promoter/organizzatori/tour
 * leader, coupon, campagne, comunicazioni, chat, credito, ecc.) per
 * ripartire puliti nei test.
 *
 * NON tocca (login e configurazione — perderli bloccherebbe l'accesso
 * al gestionale o costringerebbe a ricompilare tutto a mano):
 * amministratori, ruoli, permessi, impostazioni, template email,
 * pagine CMS/contenuti sito, layout biglietto, categorie (generi) e
 * categorie evento.
 *
 * Uso:  npm run reset-dati-test
 * Chiede conferma prima di procedere (scrivi ELIMINA per confermare).
 */

const TABELLE_DA_SVUOTARE = [
  'eventi', // CASCADE si porta dietro: tragitti, fermate, servizi, allegati_evento, immagini_evento, offerte_evento
  'prenotazioni', // CASCADE: partecipanti_prenotazione
  'bus_fisici', 'bus_tratte',
  'lista_attesa',
  'richieste_rimborso',
  'variazioni', 'variazioni_risposte',
  'ordini',
  'coupon',
  'campagne',
  'comunicazioni',
  'conversazioni_chat', 'messaggi_chat',
  'movimenti_credito',
  'log_attivita',
  'fornitori',
  'fermate_anagrafica',
  'percorsi_salvati', 'fermate_percorso_salvato',
  'promoter', 'promoter_eventi',
  'organizzatori', 'organizzatore_eventi',
  'tour_leader',
  'white_label',
  'regole_commissione',
  'utenti', // clienti del sito — NON amministratori, tabella separata
];

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Sto per svuotare queste tabelle (eventi, prenotazioni, bus, utenti clienti, fornitori, percorsi salvati, promoter/organizzatori/tour leader, coupon, campagne, comunicazioni, chat, credito, log):');
  console.log(TABELLE_DA_SVUOTARE.join(', '));
  console.log('\nNON tocca: amministratori, ruoli, permessi, impostazioni, template email, contenuti sito, layout biglietto, categorie.');
  const risposta = await rl.question('\nScrivi ELIMINA (tutto maiuscolo) per confermare: ');
  rl.close();
  if (risposta.trim() !== 'ELIMINA') {
    console.log('Annullato — nessun dato toccato.');
    process.exit(0);
  }

  const client = postgres(env.DATABASE_URL, { max: 1 });
  console.log('\nSvuoto...');
  // Un unico TRUNCATE con CASCADE: gestisce da solo l'ordine delle
  // dipendenze (chiavi esterne) tra le tabelle elencate.
  await client.unsafe(`TRUNCATE TABLE ${TABELLE_DA_SVUOTARE.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
  console.log('Fatto — tutte le tabelle elencate sono vuote. Login e configurazione sono rimasti intatti.');
  await client.end();
}

main().catch((e) => {
  console.error('Errore:', e);
  process.exit(1);
});
