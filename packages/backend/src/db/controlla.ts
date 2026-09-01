// Esegue una query e STAMPA il risultato — a differenza di
// esegui-sql.ts (pensato per INSERT/UPDATE, non mostra righe), questo
// serve apposta per controlli veloci ("cosa c'è scritto davvero nel
// database in questo momento").
//
// USO:  npm run db:controlla -- "SELECT * FROM fermate_anagrafica WHERE citta = 'Piacenza Sud'"
import postgres from 'postgres';
import { env } from '../config/env.js';

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Manca la query — uso: npm run db:controlla -- "SELECT ..."');
    process.exit(1);
  }
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const righe = await client.unsafe(query);
    console.log(`${righe.length} righe:`);
    console.table(righe);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
