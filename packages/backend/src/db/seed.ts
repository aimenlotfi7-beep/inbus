import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as schema from './schema.js';
import { env } from '../config/env.js';
import { REGISTRO_PERMESSI } from '../shared/permessi-registro.js';

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  console.log('Sincronizzo i permessi dal registro...');
  for (const def of REGISTRO_PERMESSI) {
    await db.insert(schema.permessi).values({
      chiave: def.chiave, etichetta: def.etichetta, modulo: def.modulo, attivo: true,
    }).onConflictDoNothing();
  }

  console.log('Creo il ruolo Proprietario (owner)...');
  let [ruoloOwner] = await db.select().from(schema.ruoli).where(eq(schema.ruoli.nome, 'Proprietario')).limit(1);
  if (!ruoloOwner) {
    [ruoloOwner] = await db.insert(schema.ruoli).values({
      nome: 'Proprietario',
      descrizione: 'Accesso completo, presente e futuro. Non modificabile né eliminabile.',
      owner: true,
    }).returning();
  }

  console.log('Creo l\'amministratore di default (proprietario)...');
  await db.insert(schema.amministratori).values({
    nome: 'Admin',
    email: 'admin@inbus.it',
    passwordHash: await bcrypt.hash('inbus2026', 10),
    ruoloId: ruoloOwner.id,
  }).onConflictDoNothing();

  console.log('Creo un evento di esempio con un bus e tre fermate...');
  const [evento] = await db.insert(schema.eventi).values({
    artista: 'Ultimo',
    genere: 'Pop',
    luogo: 'Stadio Olimpico',
    citta: 'Roma',
    data: new Date('2026-07-25'),
    prezzo: '29.00',
    inEvidenza: true,
  }).returning();

  const [linea] = await db.insert(schema.lineeBus).values({
    eventoId: evento.id,
    nome: 'Bus Milano-Roma',
    postiTotali: 50,
    postiDisponibili: 50,
    prezzoExtra: '0',
  }).returning();

  await db.insert(schema.fermate).values([
    { lineaId: linea.id, ordine: 0, citta: 'Milano', indirizzo: 'Piazzale Lotto', orario: '06:00' },
    { lineaId: linea.id, ordine: 1, citta: 'Bologna', indirizzo: 'Stazione Centrale', orario: '08:00' },
    { lineaId: linea.id, ordine: 2, citta: 'Roma', indirizzo: 'Stadio Olimpico', orario: '12:00' },
  ]);

  console.log('Creo le categorie di default...');
  await db.insert(schema.categorie).values([
    { nome: 'Pop' }, { nome: 'Rock' }, { nome: 'Rap' }, { nome: 'Indie' },
  ]).onConflictDoNothing();

  console.log('Seed completato. Login admin: admin@inbus.it / inbus2026');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
