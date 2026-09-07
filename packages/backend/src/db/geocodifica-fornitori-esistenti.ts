// Script una tantum: geocodifica (lat/lng/regione) i fornitori già
// esistenti che hanno un indirizzo ma non ancora una regione — capita
// per chi è stato creato PRIMA che la colonna regione esistesse. Senza
// questo, resterebbero tutti nel gruppo "Senza regione" in fondo
// all'elenco finché qualcuno non li riapre e risalva a mano.
//
// Stessa richiesta Nominatim già usata dal browser (admin/shared/geo.ts),
// qui in Node — un indirizzo al secondo, come richiesto da Nominatim.
//
// Uso: npx tsx src/db/geocodifica-fornitori-esistenti.ts

import { and, isNull, isNotNull } from 'drizzle-orm';
import { db } from './client.js';
import { fornitori } from './schema.js';
import { eq } from 'drizzle-orm';

async function attendi(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const daFare = await db.select().from(fornitori).where(and(isNotNull(fornitori.indirizzo), isNull(fornitori.regione)));
  console.log(`${daFare.length} fornitore/i senza regione da geocodificare.`);

  for (const f of daFare) {
    if (!f.indirizzo?.trim()) continue;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(f.indirizzo)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'OnWay gestionale (script una tantum)' } });
      const risultati = await res.json() as any[];
      if (risultati?.[0]) {
        const lat = Number(risultati[0].lat), lng = Number(risultati[0].lon);
        const regione = risultati[0].address?.state ?? null;
        await db.update(fornitori).set({ lat, lng, regione }).where(eq(fornitori.id, f.id));
        console.log(`  ✓ ${f.nome}: ${regione ?? '(regione non trovata)'}`);
      } else {
        console.log(`  ✗ ${f.nome}: indirizzo non trovato ("${f.indirizzo}")`);
      }
    } catch (e) {
      console.log(`  ✗ ${f.nome}: errore di rete —`, e instanceof Error ? e.message : e);
    }
    await attendi(1100); // 1 richiesta al secondo, come richiede Nominatim
  }

  console.log('Fatto.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
