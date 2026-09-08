// Esporta tutte le fermate anagrafica in un CSV con un link Google Maps
// pronto per ognuna — utile per controllarle una per una senza
// aprirle a mano nel gestionale. Se una fermata ha lat/lng, il link
// punta esattamente lì; altrimenti fa una ricerca testuale su
// indirizzo+città (meno precisa, ma comunque utile).
//
// Uso: npx tsx src/db/esporta-fermate-con-mappa.ts

import { db } from './client.js';
import { fermateAnagrafica } from './schema.js';
import { asc } from 'drizzle-orm';
import { writeFileSync } from 'fs';

function linkMaps(lat: number | null, lng: number | null, indirizzo: string, citta: string): string {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${indirizzo}, ${citta}`)}`;
}

function csvCella(v: string): string {
  // Le virgolette doppie si raddoppiano (regola standard CSV); tutto tra virgolette
  // così virgole/accenti nell'indirizzo non rompono le colonne.
  return `"${v.replace(/"/g, '""')}"`;
}

async function main() {
  const righe = await db.select().from(fermateAnagrafica).orderBy(asc(fermateAnagrafica.regione), asc(fermateAnagrafica.citta), asc(fermateAnagrafica.nome));

  const intestazione = ['Nome', 'Città', 'Indirizzo', 'Regione', 'Link Google Maps', 'Note'];
  const corpo = righe.map((f) => [
    f.nome, f.citta, f.indirizzo, f.regione ?? '(nessuna)',
    linkMaps(f.lat, f.lng, f.indirizzo, f.citta),
    f.note ?? '',
  ].map(csvCella).join(','));

  // \uFEFF (BOM) in testa: senza, Excel su Windows a volte mostra gli
  // accenti italiani rotti aprendo un CSV UTF-8.
  const contenuto = '\uFEFF' + [intestazione.map(csvCella).join(','), ...corpo].join('\r\n');
  const percorso = 'fermate-con-mappa.csv';
  writeFileSync(percorso, contenuto, 'utf-8');

  console.log(`Fatto — ${righe.length} fermate scritte in ${percorso}`);
  console.log(`Senza regione: ${righe.filter((f) => !f.regione).length}`);
  console.log(`Senza coordinate (link solo testuale): ${righe.filter((f) => f.lat == null).length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
