// Scrive un link Google Maps nel campo "Link" di ogni fermata anagrafica
// che ne è ancora priva — quel campo compare nel gestionale (form
// Fermate) e sul sito. Tocca SOLO le fermate con link vuoto: se ne hai
// già impostato uno a mano (es. il sito del bar/hotel di ritrovo, non
// necessariamente una mappa), quello resta com'è.
//
// Uso: npx tsx src/db/popola-link-maps-fermate.ts

import { isNull, or, eq } from 'drizzle-orm';
import { db } from './client.js';
import { fermateAnagrafica } from './schema.js';

function linkMaps(lat: number | null, lng: number | null, indirizzo: string, citta: string): string {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${indirizzo}, ${citta}`)}`;
}

async function main() {
  const daFare = await db.select().from(fermateAnagrafica).where(or(isNull(fermateAnagrafica.link), eq(fermateAnagrafica.link, '')));
  console.log(`${daFare.length} fermata/e senza link — scrivo Google Maps su ognuna.`);

  for (const f of daFare) {
    const link = linkMaps(f.lat, f.lng, f.indirizzo, f.citta);
    await db.update(fermateAnagrafica).set({ link }).where(eq(fermateAnagrafica.id, f.id));
    console.log(`  ✓ ${f.nome} (${f.citta})${f.lat == null ? ' — solo ricerca testuale, mancano le coordinate' : ''}`);
  }

  console.log('Fatto.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
