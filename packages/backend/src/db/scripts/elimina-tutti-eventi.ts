// Script DISTRUTTIVO — elimina DAVVERO e PER SEMPRE tutti gli eventi
// (non un'eliminazione "morbida" recuperabile dal Cestino: una vera
// DELETE dal database). A cascata si porta via tutto quello che
// dipende da un evento: tragitti, fermate, prenotazioni, bus, Linee,
// bus_fermate, bus_tratte — letteralmente tutto quello collegato.
//
// Va usato SOLO per ripartire puliti in fase di test — MAI su un
// database con clienti veri e prenotazioni vere.
//
// Uso: dentro packages/backend, con .env puntato al tunnel Railway:
//   npx tsx src/db/scripts/elimina-tutti-eventi.ts --conferma
//
// Senza "--conferma" lo script si ferma subito, senza toccare nulla —
// apposta, per evitare di lanciarlo per sbaglio.

import { db } from '../client.js';
import { eventi, prenotazioni } from '../schema.js';

async function main() {
  const confermato = process.argv.includes('--conferma');

  const righeEventi = await db.select().from(eventi);
  const righePrenotazioni = await db.select().from(prenotazioni);
  console.log(`Trovati ${righeEventi.length} eventi e ${righePrenotazioni.length} prenotazioni nel database.`);

  if (righeEventi.length === 0 && righePrenotazioni.length === 0) {
    console.log('Niente da eliminare — il database è già vuoto.');
    return;
  }

  if (!confermato) {
    console.log('');
    console.log('⚠ NESSUNA modifica fatta — questo era solo un controllo.');
    console.log('Per eliminare DAVVERO e PER SEMPRE tutto questo (eventi, tragitti, prenotazioni, bus, Linee), rilancia con:');
    console.log('  npx tsx src/db/scripts/elimina-tutti-eventi.ts --conferma');
    return;
  }

  // Le prenotazioni NON hanno cancellazione automatica verso eventi/
  // tragitti (probabilmente voluto, per proteggere prenotazioni vere
  // da cancellazioni accidentali) — vanno tolte PRIMA, altrimenti
  // l'eliminazione degli eventi si blocca con un errore di vincolo.
  console.log(`Elimino prima ${righePrenotazioni.length} prenotazioni...`);
  await db.delete(prenotazioni);
  console.log(`Ora elimino DEFINITIVAMENTE ${righeEventi.length} eventi e tutto ciò che è collegato (tragitti, bus, Linee)...`);
  await db.delete(eventi);
  console.log('✓ Fatto. Il database è ora senza nessun evento.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
