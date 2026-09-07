// Script una tantum, gemello di geocodifica-fornitori-esistenti.ts:
// popola la regione delle fermate anagrafica già esistenti (create
// prima che la colonna regione esistesse).
//
// Uso: npx tsx src/db/geocodifica-fermate-esistenti.ts

import { isNull, eq } from 'drizzle-orm';
import { db } from './client.js';
import { fermateAnagrafica } from './schema.js';

async function attendi(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const daFare = await db.select().from(fermateAnagrafica).where(isNull(fermateAnagrafica.regione));
  console.log(`${daFare.length} fermata/e senza regione da geocodificare.`);

  for (const f of daFare) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(`${f.indirizzo}, ${f.citta}`)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'OnWay gestionale (script una tantum)' } });
      const risultati = await res.json() as any[];
      if (risultati?.[0]) {
        const regione = risultati[0].address?.state ?? null;
        await db.update(fermateAnagrafica).set({ regione }).where(eq(fermateAnagrafica.id, f.id));
        console.log(`  ✓ ${f.nome} (${f.citta}): ${regione ?? '(regione non trovata)'}`);
      } else {
        console.log(`  ✗ ${f.nome}: indirizzo non trovato`);
      }
    } catch (e) {
      console.log(`  ✗ ${f.nome}: errore di rete —`, e instanceof Error ? e.message : e);
    }
    await attendi(1100);
  }

  console.log('Fatto.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
