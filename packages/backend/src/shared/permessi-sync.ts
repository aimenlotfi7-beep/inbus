import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { permessi } from '../db/schema.js';
import { REGISTRO_PERMESSI } from './permessi-registro.js';

/** Allinea la tabella `permessi` al registro nel codice. Va chiamata una
 *  volta all'avvio del server (vedi server.ts). Aggiunge le chiavi nuove,
 *  aggiorna etichetta/modulo di quelle esistenti, e disattiva (non
 *  elimina) quelle non più presenti nel registro. */
export async function sincronizzaPermessi() {
  const chiaviRegistro = REGISTRO_PERMESSI.map((p) => p.chiave);

  for (const def of REGISTRO_PERMESSI) {
    await db
      .insert(permessi)
      .values({ chiave: def.chiave, etichetta: def.etichetta, modulo: def.modulo, attivo: true })
      .onConflictDoUpdate({
        target: permessi.chiave,
        set: { etichetta: def.etichetta, modulo: def.modulo, attivo: true },
      });
  }

  const tutti = await db.select({ chiave: permessi.chiave }).from(permessi);
  const daDisattivare = tutti.map((p) => p.chiave).filter((c) => !chiaviRegistro.includes(c));

  if (daDisattivare.length > 0) {
    await db.update(permessi).set({ attivo: false }).where(inArray(permessi.chiave, daDisattivare));
  }

  console.log(`Permessi sincronizzati: ${chiaviRegistro.length} attivi${daDisattivare.length ? `, ${daDisattivare.length} disattivati` : ''}.`);
}
