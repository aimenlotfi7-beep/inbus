// Esegue direttamente le correzioni sulla tabella offerte_evento,
// usando la stessa connessione già configurata dal progetto (legge
// DATABASE_URL da .env, esattamente come fa la migrazione).
// Uso: npx tsx fix-sconto-percentuale.ts
import postgres from 'postgres';
import { env } from './src/config/env.js';

const sql = postgres(env.DATABASE_URL);

async function main() {
  console.log('Applico le correzioni...');
  await sql`ALTER TABLE "offerte_evento" ADD COLUMN IF NOT EXISTS "sconto_percentuale" numeric(5, 2) NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE "offerte_evento" ALTER COLUMN "sconto_percentuale" DROP DEFAULT`;
  await sql`ALTER TABLE "offerte_evento" DROP COLUMN IF EXISTS "prezzo"`;
  await sql`ALTER TABLE "offerte_evento" DROP COLUMN IF EXISTS "prezzo_originale"`;
  console.log('Fatto: colonna sconto_percentuale pronta, prezzo/prezzo_originale rimosse.');
  await sql.end();
}

main().catch((err) => {
  console.error('Errore:', err);
  process.exit(1);
});
