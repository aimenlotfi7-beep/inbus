import { db } from './client.js';
import { eventi, tragitti, servizi, prenotazioni } from './schema.js';
import { eq, ilike } from 'drizzle-orm';

async function main() {
  const eventiTrovati = await db.select().from(eventi).where(ilike(eventi.artista, '%test 3%'));
  if (eventiTrovati.length === 0) {
    console.log('Nessun evento trovato con "test 3" nel nome.');
    return;
  }

  for (const ev of eventiTrovati) {
    console.log('\n========================================');
    console.log(`EVENTO: "${ev.artista}" (id: ${ev.id})`);
    console.log('========================================');

    const serviziEvento = await db.select().from(servizi).where(eq(servizi.eventoId, ev.id));
    console.log(`\nServizi (${serviziEvento.length}):`);
    for (const s of serviziEvento) console.log(`  - "${s.nome}" (id: ${s.id})`);

    // TUTTI i tragitti di questo evento, INCLUSI quelli già eliminati
    // (eliminatoIl non nullo) — è proprio questi ultimi che ci
    // interessano, per vedere se sono rimasti "fantasmi" con
    // prenotazioni ancora agganciate.
    const tuttiTragitti = await db.select().from(tragitti).where(eq(tragitti.eventoId, ev.id));
    console.log(`\nTragitti totali nel database (${tuttiTragitti.length}, inclusi quelli eliminati):`);

    for (const t of tuttiTragitti) {
      const prenotazioniCollegate = await db.select().from(prenotazioni).where(eq(prenotazioni.tragittoId, t.id));
      const confermate = prenotazioniCollegate.filter((p) => p.stato === 'CONFERMATA');
      console.log(`\n  - "${t.nome}" (id: ${t.id})`);
      console.log(`    servizioId: ${t.servizioId ?? 'NESSUNO (libero)'}`);
      console.log(`    eliminatoIl: ${t.eliminatoIl ? t.eliminatoIl.toISOString() + '  <-- FANTASMA (soft-eliminato)' : 'no (attivo)'}`);
      console.log(`    prenotazioni totali collegate: ${prenotazioniCollegate.length} (di cui confermate: ${confermate.length})`);
      if (confermate.length) {
        for (const p of confermate) console.log(`      PNR ${p.pnr} - confermata`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
