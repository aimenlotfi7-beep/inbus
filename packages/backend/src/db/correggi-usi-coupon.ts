// Script una tantum: corregge usiAttuali di UN coupon/voucher — serve
// per il bug (ora corretto) che contava un acquisto multi-evento
// (bundle/carrello) più volte invece di una sola. Non tocca nient'altro
// del coupon (sconto, validità, compenso restano invariati).
//
// Uso: npx tsx src/db/correggi-usi-coupon.ts CODICE NUOVO_VALORE
// Esempio: npx tsx src/db/correggi-usi-coupon.ts SDFGH 2

import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { coupon } from './schema.js';

async function main() {
  const [codice, valoreStr] = process.argv.slice(2);
  const nuovoValore = Number(valoreStr);
  if (!codice || !Number.isInteger(nuovoValore) || nuovoValore < 0) {
    console.error('Uso: npx tsx src/db/correggi-usi-coupon.ts CODICE NUOVO_VALORE');
    process.exit(1);
  }

  const [c] = await db.select().from(coupon).where(eq(coupon.codice, codice.toUpperCase())).limit(1);
  if (!c) {
    console.error(`Nessun coupon/voucher con codice "${codice}".`);
    process.exit(1);
  }

  console.log(`Trovato "${c.codice}": usiAttuali attuale = ${c.usiAttuali}. Imposto a ${nuovoValore}...`);
  await db.update(coupon).set({ usiAttuali: nuovoValore }).where(eq(coupon.id, c.id));
  console.log('Fatto.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
