// Script una tantum: azzera TUTTE le prenotazioni (e tutto quello che
// dipende da loro) prima di un vero lancio pubblico - da usare UNA
// VOLTA SOLA, quando si è certi che ogni prenotazione esistente sia di
// test. Non tocca eventi/tragitti/linee/bus (il "catalogo" costruito
// finora resta) - solo lo storico transazionale.
//
// Oltre alle prenotazioni stesse, ripristina tutto quello che avevano
// consumato o modificato, altrimenti resterebbero residui invisibili:
// - posti bloccati sui tragitti (postiDisponibili riportato a postiTotali)
// - utilizzi contati sui coupon/voucher (usiAttuali riportato a 0)
// - credito fedeltà maturato dai clienti di test (azzerato, insieme
//   allo storico dei movimenti che lo ha generato)
// - gli ordini (carrello/bundle) che raggruppavano quelle prenotazioni
//
// Uso: npx tsx src/db/azzera-prenotazioni-test.ts CONFERMO
// (l'argomento CONFERMO è voluto: uno scudo minimo contro un doppio
// clic o un copia-incolla distratto - senza, lo script si ferma e
// basta, senza toccare nulla.)

import { sql } from 'drizzle-orm';
import { db } from './client.js';
import { prenotazioni, tragitti, coupon, utenti, movimentiCredito, ordini } from './schema.js';

async function main() {
  if (process.argv[2] !== 'CONFERMO') {
    console.error('Uso: npx tsx src/db/azzera-prenotazioni-test.ts CONFERMO');
    console.error('(il secondo argomento è voluto, per non lanciarlo per sbaglio - CANCELLA DAVVERO tutte le prenotazioni, non si torna indietro)');
    process.exit(1);
  }

  const [{ n: numPrenotazioni }] = await db.select({ n: sql<number>`count(*)::int` }).from(prenotazioni);
  const [{ n: numOrdini }] = await db.select({ n: sql<number>`count(*)::int` }).from(ordini);
  const [{ n: numMovimenti }] = await db.select({ n: sql<number>`count(*)::int` }).from(movimentiCredito);

  console.log(`Trovate: ${numPrenotazioni} prenotazioni, ${numOrdini} ordini, ${numMovimenti} movimenti di credito.`);
  if (numPrenotazioni === 0) {
    console.log('Niente da cancellare — il database è già pulito su questo fronte.');
    process.exit(0);
  }
  console.log('Procedo tra 3 secondi... (Ctrl+C ora per annullare)');
  await new Promise((r) => setTimeout(r, 3000));

  await db.transaction(async (tx) => {
    // Le prenotazioni prima — partecipanti, risposte a variazioni e
    // richieste di rimborso si cancellano da soli a cascata (definito
    // così nello schema). Il credito legato a una prenotazione NON si
    // cancella a cascata (onDelete: set null, apposta: serve poter
    // tenere lo storico crediti anche se la prenotazione viene
    // cancellata per altri motivi) - qui invece lo vogliamo VIA
    // anche lui, quindi lo cancelliamo esplicitamente subito dopo.
    await tx.delete(prenotazioni);
    await tx.delete(movimentiCredito);
    await tx.delete(ordini);

    // Ripristina i posti — ogni prenotazione di test aveva bloccato
    // dei posti veri sui tragitti, restano bloccati per sempre se non
    // si riportano a postiTotali esplicitamente (non è un calcolo
    // automatico, è un contatore salvato).
    await tx.update(tragitti).set({ postiDisponibili: sql`${tragitti.postiTotali}` });

    // Stessa cosa per i coupon/voucher usati nei test.
    await tx.update(coupon).set({ usiAttuali: 0 });

    // E il credito fedeltà residuo sui clienti di test.
    await tx.update(utenti).set({ creditoDisponibile: '0' });
  });

  console.log('Fatto — prenotazioni, ordini e movimenti di credito cancellati; posti, coupon e crediti ripristinati.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
