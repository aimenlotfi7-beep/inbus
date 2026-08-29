import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '../config/env.js';

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  console.log('Applico le migration...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migration completate.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
