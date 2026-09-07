import { inArray, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { permessi, ruoloPermessi } from '../db/schema.js';
import { REGISTRO_PERMESSI } from './permessi-registro.js';

/** Allinea la tabella `permessi` al registro nel codice. Va chiamata una
 *  volta all'avvio del server (vedi server.ts). Aggiunge le chiavi nuove,
 *  aggiorna etichetta/modulo di quelle esistenti, e disattiva (non
 *  elimina) quelle non più presenti nel registro. */
export async function sincronizzaPermessi() {
  const chiaviRegistro = REGISTRO_PERMESSI.map((p) => p.chiave);

  const giaPresenti = new Set((await db.select({ chiave: permessi.chiave }).from(permessi)).map((p) => p.chiave));

  for (const def of REGISTRO_PERMESSI) {
    await db
      .insert(permessi)
      .values({ chiave: def.chiave, etichetta: def.etichetta, modulo: def.modulo, attivo: true })
      .onConflictDoUpdate({
        target: permessi.chiave,
        set: { etichetta: def.etichetta, modulo: def.modulo, attivo: true },
      });
    // Prima comparsa di un permesso "figlio": lo ereditano i ruoli che
    // hanno già il "padre" (vedi DefinizionePermesso.ereditaDa). Solo
    // la prima volta — dopo, il proprietario decide da Ruoli.
    if (def.ereditaDa && !giaPresenti.has(def.chiave)) {
      const ruoliConPadre = await db.select({ ruoloId: ruoloPermessi.ruoloId }).from(ruoloPermessi).where(eq(ruoloPermessi.permessoChiave, def.ereditaDa));
      if (ruoliConPadre.length > 0) {
        await db.insert(ruoloPermessi)
          .values(ruoliConPadre.map((r) => ({ ruoloId: r.ruoloId, permessoChiave: def.chiave })))
          .onConflictDoNothing();
        console.log(`Permesso nuovo ${def.chiave}: ereditato da ${def.ereditaDa} su ${ruoliConPadre.length} ruolo/i.`);
      }
    }
  }

  const tutti = await db.select({ chiave: permessi.chiave }).from(permessi);
  const daDisattivare = tutti.map((p) => p.chiave).filter((c) => !chiaviRegistro.includes(c));

  if (daDisattivare.length > 0) {
    await db.update(permessi).set({ attivo: false }).where(inArray(permessi.chiave, daDisattivare));
  }

  console.log(`Permessi sincronizzati: ${chiaviRegistro.length} attivi${daDisattivare.length ? `, ${daDisattivare.length} disattivati` : ''}.`);
}
