import postgres from 'postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { indirizzoDatabaseDiProva } from './database-di-prova.js';

/** Una volta sola prima di tutti i test con il database: crea il database di
 *  prova se manca e gli applica le migrazioni che mancano.
 *
 *  Una migrazione alla volta, come sono arrivate su Railway nel tempo: il
 *  migratore di drizzle le applica tutte in un'unica transazione, e su un
 *  database vuoto si ferma (una migrazione aggiunge un valore a un elenco,
 *  per esempio lo stato "PREZZATO", e una successiva lo usa: PostgreSQL non
 *  lo permette nella stessa transazione). Le registra nella stessa tabella di
 *  drizzle, così i due modi restano compatibili. */
export default async function preparaDatabase() {
  const indirizzo = indirizzoDatabaseDiProva();
  const nome = new URL(indirizzo).pathname.replace(/^\//, '');

  const manutenzione = new URL(indirizzo);
  manutenzione.pathname = '/postgres';
  const server = postgres(manutenzione.toString(), { max: 1, onnotice: () => {} });
  try {
    const [esiste] = await server`select 1 from pg_database where datname = ${nome}`;
    if (!esiste) await server.unsafe(`create database "${nome}"`);
  } finally {
    await server.end();
  }

  const client = postgres(indirizzo, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe('create schema if not exists drizzle');
    await client.unsafe('create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)');
    const [ultima] = await client`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`;
    const applicataFinoA = ultima ? Number(ultima.created_at) : 0;

    for (const migrazione of readMigrationFiles({ migrationsFolder: './drizzle' })) {
      if (migrazione.folderMillis <= applicataFinoA) continue;
      await client.begin(async (tx) => {
        for (const istruzione of migrazione.sql) {
          if (istruzione.trim()) await tx.unsafe(istruzione);
        }
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migrazione.hash}, ${migrazione.folderMillis})`;
      });
    }
  } finally {
    await client.end();
  }
}
