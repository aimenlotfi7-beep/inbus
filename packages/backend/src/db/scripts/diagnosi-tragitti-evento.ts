// Script di sola VERIFICA — mostra i tragitti veri collegati
// all'evento "Test" (o al nome che passi), direttamente dal database,
// bypassando l'interfaccia del gestionale.
//
// Uso: dentro packages/backend, con .env puntato al tunnel Railway:
//   npx tsx src/db/scripts/diagnosi-tragitti-evento.ts Test

import { eq, ilike } from 'drizzle-orm';
import { db } from '../client.js';
import { eventi, tragitti, servizi } from '../schema.js';

async function main() {
  const nomeCercato = process.argv[2] ?? 'Test';
  const eventiTrovati = await db.select().from(eventi).where(ilike(eventi.artista, `%${nomeCercato}%`));

  if (eventiTrovati.length === 0) {
    console.log(`Nessun evento trovato con "${nomeCercato}" nel nome.`);
    return;
  }

  for (const ev of eventiTrovati) {
    console.log(`\n=== Evento "${ev.artista}" (id: ${ev.id}) ===`);
    console.log(`eliminatoIl: ${ev.eliminatoIl ?? 'no (attivo)'}`);

    const tuttiITragitti = await db.select().from(tragitti).where(eq(tragitti.eventoId, ev.id));
    console.log(`Tragitti collegati a questo evento (righe vere nel database): ${tuttiITragitti.length}`);
    for (const t of tuttiITragitti) {
      const servizioNome = t.servizioId
        ? (await db.select().from(servizi).where(eq(servizi.id, t.servizioId)).limit(1))[0]?.nome ?? '(servizio non trovato)'
        : null;
      console.log(`  - id: ${t.id} | nome: "${t.nome}" | attivo: ${t.attivo} | stato: ${t.stato} | servizioId: ${t.servizioId ?? 'nessuno (libero)'} ${servizioNome ? `(${servizioNome})` : ''}`);
    }

    const tuttiIServizi = await db.select().from(servizi).where(eq(servizi.eventoId, ev.id));
    console.log(`Servizi collegati a questo evento: ${tuttiIServizi.length}`);
    for (const s of tuttiIServizi) {
      console.log(`  - id: ${s.id} | nome: "${s.nome}"`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
