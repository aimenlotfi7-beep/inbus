// Script una tantum da eseguire su un database che ha GIÀ dati con il
// vecchio sistema di ruoli fissi (colonna `ruolo` con valori
// 'AMMINISTRATORE' | 'OPERATORE' | 'COLLABORATORE').
//
// Cosa fa:
// 1. Sincronizza la tabella `permessi` dal registro nel codice.
// 2. Crea il ruolo "Proprietario" (owner = true, permessi impliciti su
//    tutto). Ogni amministratore che aveva `ruolo = 'AMMINISTRATORE'`
//    diventa Proprietario — così nessuno perde l'accesso.
// 3. Crea due ruoli di partenza "Operatore" e "Collaboratore" con un
//    set di permessi ragionevole (modificabile poi liberamente dal
//    gestionale, sezione Ruoli) e ci sposta gli amministratori che
//    avevano quei vecchi ruoli.
// 4. Esegue il backfill di `ruolo_id` su ogni riga di `amministratori`.
//
// Uso: npx tsx src/db/migra-permessi.ts
// Da eseguire DOPO aver applicato la migrazione 0001
// (npm run db:migrate) e PRIMA della migrazione 0002.

import { eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { amministratori, ruoli, ruoloPermessi, permessi } from './schema.js';
import { REGISTRO_PERMESSI } from '../shared/permessi-registro.js';

async function main() {
  console.log('Sincronizzo i permessi dal registro...');
  for (const def of REGISTRO_PERMESSI) {
    await db.insert(permessi).values({
      chiave: def.chiave, etichetta: def.etichetta, modulo: def.modulo, attivo: true,
    }).onConflictDoNothing();
  }

  console.log('Creo il ruolo Proprietario...');
  let [proprietario] = await db.select().from(ruoli).where(eq(ruoli.nome, 'Proprietario')).limit(1);
  if (!proprietario) {
    [proprietario] = await db.insert(ruoli).values({
      nome: 'Proprietario',
      descrizione: 'Accesso completo, presente e futuro. Non modificabile né eliminabile.',
      owner: true,
    }).returning();
  }

  const tuttiPermessi = await db.select({ chiave: permessi.chiave }).from(permessi);
  const chiaviTutte = tuttiPermessi.map((p) => p.chiave);

  console.log('Creo il ruolo Operatore (punto di partenza, modificabile dal gestionale)...');
  let [operatore] = await db.select().from(ruoli).where(eq(ruoli.nome, 'Operatore')).limit(1);
  if (!operatore) {
    [operatore] = await db.insert(ruoli).values({ nome: 'Operatore', descrizione: 'Gestione operativa quotidiana.' }).returning();
    const permessiOperatore = chiaviTutte.filter((c) => !c.startsWith('utenze.') && !c.startsWith('permessi.'));
    if (permessiOperatore.length > 0) {
      await db.insert(ruoloPermessi).values(permessiOperatore.map((c) => ({ ruoloId: operatore.id, permessoChiave: c })));
    }
  }

  console.log('Creo il ruolo Collaboratore (punto di partenza, modificabile dal gestionale)...');
  let [collaboratore] = await db.select().from(ruoli).where(eq(ruoli.nome, 'Collaboratore')).limit(1);
  if (!collaboratore) {
    [collaboratore] = await db.insert(ruoli).values({ nome: 'Collaboratore', descrizione: 'Accesso limitato, principalmente in lettura.' }).returning();
    const permessiCollaboratore = chiaviTutte.filter((c) => c.endsWith('.visualizza') || c.startsWith('chat.'));
    if (permessiCollaboratore.length > 0) {
      await db.insert(ruoloPermessi).values(permessiCollaboratore.map((c) => ({ ruoloId: collaboratore.id, permessoChiave: c })));
    }
  }

  console.log('Assegno ruolo_id a tutti gli amministratori esistenti in base al vecchio campo ruolo...');
  // `ruolo` non è più dichiarata nello schema Drizzle (sostituita da
  // ruolo_id): leggiamo la colonna fisica ancora presente nel database
  // con una query SQL grezza, così funziona anche se lo schema.ts nel
  // codice non la conosce più.
  const righeGrezze = await db.execute<{ id: string; email: string; ruolo: string | null; ruolo_id: string | null }>(
    sql`SELECT id, email, ruolo, ruolo_id FROM amministratori WHERE ruolo_id IS NULL`
  );
  for (const a of righeGrezze) {
    const vecchioRuolo = a.ruolo;
    const nuovoRuoloId = vecchioRuolo === 'AMMINISTRATORE' ? proprietario.id
      : vecchioRuolo === 'OPERATORE' ? operatore.id
      : collaboratore.id;
    await db.update(amministratori).set({ ruoloId: nuovoRuoloId }).where(eq(amministratori.id, a.id));
    console.log(`  - ${a.email}: ${vecchioRuolo ?? '(nessuno)'} -> ${nuovoRuoloId === proprietario.id ? 'Proprietario' : nuovoRuoloId === operatore.id ? 'Operatore' : 'Collaboratore'}`);
  }

  console.log('Fatto. Ora puoi applicare la migrazione 0002 (npm run db:migrate) per rendere ruolo_id obbligatoria e rimuovere la vecchia colonna.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
