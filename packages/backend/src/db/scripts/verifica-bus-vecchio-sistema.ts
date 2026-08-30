// Script di sola VERIFICA — non elimina né modifica nulla, controlla
// solo se restano dati nel vecchio sistema (bus_fermate, bus_tratte) o
// contenitori Linea rimasti vuoti dopo aver eliminato tutti i bus.
//
// Uso: dentro packages/backend, con .env puntato al tunnel Railway:
//   npx tsx src/db/scripts/verifica-bus-vecchio-sistema.ts

import { db } from '../client.js';
import { busFermate, busTratte, busFisici, linee, lineaFermate } from '../schema.js';

async function main() {
  const [righeBusFermate, righeBusTratte, righeBus, righeLinee, righeLineaFermate] = await Promise.all([
    db.select().from(busFermate),
    db.select().from(busTratte),
    db.select().from(busFisici),
    db.select().from(linee),
    db.select().from(lineaFermate),
  ]);

  console.log('--- Verifica dati bus/Linee ---');
  console.log(`bus_fisici (righe totali):     ${righeBus.length}`);
  console.log(`bus_fermate (vecchio sistema): ${righeBusFermate.length}`);
  console.log(`bus_tratte (vecchio sistema):  ${righeBusTratte.length}`);
  console.log(`linee (contenitori):           ${righeLinee.length}`);
  console.log(`linea_fermate:                 ${righeLineaFermate.length}`);
  console.log('');

  const tuttoVuoto = righeBus.length === 0 && righeBusFermate.length === 0 && righeBusTratte.length === 0;
  if (tuttoVuoto && righeLinee.length === 0) {
    console.log('✓ Tutto vuoto — nessun bus, nessuna Linea, nessun dato nel vecchio sistema. Sicuro rimuovere il codice di compatibilità.');
  } else if (tuttoVuoto && righeLinee.length > 0) {
    console.log(`⚠ Nessun bus, ma sono rimasti ${righeLinee.length} contenitori "Linea" vuoti (creati e poi svuotati togliendo i bus dentro). Non bloccano nulla, ma vanno ripuliti separatamente se vuoi partire puliti del tutto.`);
  } else {
    console.log('✗ NON tutto vuoto — ci sono ancora dati. Se vuoi ripartire da zero, serve prima eliminare tutti gli eventi (vedi lo script apposito).');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
