// Esegue un file .sql a piacere sul database — stesso identico
// schema di connessione già usato da migrate.ts (stessa variabile
// d'ambiente DATABASE_URL, stesso tunnel quando serve). Utile per
// caricamenti "una tantum" come questo (percorsi di prova, fermate
// anagrafica importate da un concorrente) che non sono vere migrazioni
// di struttura, solo dati.
//
// USO:  npm run db:esegui-sql -- percorsi/2_percorso_prova.sql
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { env } from '../config/env.js';

async function main() {
  const percorsoFile = process.argv[2];
  if (!percorsoFile) {
    console.error('Manca il percorso del file .sql — uso: npm run db:esegui-sql -- percorso/al/file.sql');
    process.exit(1);
  }
  const sql = readFileSync(percorsoFile, 'utf-8');
  const client = postgres(env.DATABASE_URL, { max: 1 });
  console.log(`Eseguo ${percorsoFile}...`);
  try {
    await client.unsafe(sql);
    console.log('Fatto.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
