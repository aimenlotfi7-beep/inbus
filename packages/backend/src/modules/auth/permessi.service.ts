import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { amministratori, ruoli, ruoloPermessi, amministratorePermessi } from '../../db/schema.js';

export interface PermessiEffettivi {
  owner: boolean;
  permessi: Set<string>; // ignorato/irrilevante se owner === true
  /** Collaboratore che vede solo i suoi eventi (mai per il proprietario). */
  soloEventiAssegnati: boolean;
}

/** I permessi di un collaboratore con "solo gli eventi assegnati"
 *  (amministratori.soloEventiAssegnati), qualunque sia il suo ruolo: li ha
 *  tutti di serie e il proprietario può toglierne qualcuno con le eccezioni
 *  personali, mai aggiungerne altri (proprietario, settembre 2026:
 *  "automatici, ma devo poterli modificare"). Sono le funzioni che il
 *  server sa limitare ai suoi eventi (eventiAssegnati.ts).
 *  Tutto il resto mostra dati di tutti gli eventi o di tutti i clienti
 *  (statistiche e dati economici, clienti, promoter, White Label, coupon,
 *  impostazioni…) oppure cambia anagrafiche condivise (fornitori, percorsi
 *  salvati), e resta chiuso. Regole del proprietario (settembre 2026): il
 *  collaboratore vede il suo compenso, non incassi, costi e margini; fa
 *  solo la parte operativa (eventi e partenze): prenotazioni, lista
 *  d'attesa e comunicazioni ai clienti le gestisce il team OnWay (niente
 *  permessi prenotazioni.*, e `nonPerCollaboratori` dove il permesso è
 *  quello degli eventi). */
export const PERMESSI_COLLABORATORE: ReadonlySet<string> = new Set([
  'eventi.visualizza', 'eventi.crea', 'eventi.partenze', 'eventi.calendario', 'preventivi.accetta',
  'fornitori.visualizza', 'tragitti.visualizza', 'tourleader.visualizza',
]);

/** Calcola i permessi effettivi di un amministratore: permessi del suo
 *  ruolo (per un collaboratore PERMESSI_COLLABORATORE), con sopra applicate
 *  le eventuali eccezioni personali (concedi/nega). Un ruolo "owner" ha
 *  sempre tutti i permessi, presenti e futuri, a prescindere dalle
 *  eccezioni (che vengono ignorate in quel caso). */
export async function permessiEffettivi(amministratoreId: string): Promise<PermessiEffettivi> {
  const [admin] = await db
    .select({ ruoloId: amministratori.ruoloId, attivo: amministratori.attivo, soloEventiAssegnati: amministratori.soloEventiAssegnati })
    .from(amministratori)
    .where(eq(amministratori.id, amministratoreId))
    .limit(1);

  // Un'utenza disattivata perde subito ogni permesso, anche con un token
  // ancora valido (dura 12 ore).
  if (!admin || !admin.attivo) return { owner: false, permessi: new Set(), soloEventiAssegnati: false };

  const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, admin.ruoloId)).limit(1);
  if (!ruolo) return { owner: false, permessi: new Set(), soloEventiAssegnati: false };
  if (ruolo.owner) return { owner: true, permessi: new Set(), soloEventiAssegnati: false };

  // Collaboratore: la parte operativa di serie, il ruolo non conta.
  const insieme = admin.soloEventiAssegnati
    ? new Set(PERMESSI_COLLABORATORE)
    : new Set((await db
      .select({ chiave: ruoloPermessi.permessoChiave })
      .from(ruoloPermessi)
      .where(eq(ruoloPermessi.ruoloId, ruolo.id))).map((r) => r.chiave));

  const eccezioni = await db
    .select()
    .from(amministratorePermessi)
    .where(eq(amministratorePermessi.amministratoreId, amministratoreId));

  for (const e of eccezioni) {
    if (e.concesso) insieme.add(e.permessoChiave);
    else insieme.delete(e.permessoChiave);
  }

  // Un'eccezione non allarga mai un collaboratore oltre la parte operativa.
  if (admin.soloEventiAssegnati) {
    for (const chiave of insieme) if (!PERMESSI_COLLABORATORE.has(chiave)) insieme.delete(chiave);
  }
  return { owner: false, permessi: insieme, soloEventiAssegnati: admin.soloEventiAssegnati };
}

export async function haPermesso(amministratoreId: string, chiave: string): Promise<boolean> {
  const eff = await permessiEffettivi(amministratoreId);
  return eff.owner || eff.permessi.has(chiave);
}

/** Vero se `chiaviRichieste` è un sotto-insieme di ciò che possiede
 *  `amministratoreId`. Usata per impedire che qualcuno assegni ad altri
 *  (creando un'utenza o definendo un ruolo) più permessi di quanti ne
 *  abbia lui stesso. Chi è owner può sempre assegnare qualunque cosa. */
export async function puoAssegnare(amministratoreId: string, chiaviRichieste: string[]): Promise<boolean> {
  const eff = await permessiEffettivi(amministratoreId);
  if (eff.owner) return true;
  return chiaviRichieste.every((c) => eff.permessi.has(c));
}

/** Sotto-insieme di `chiaviRichieste` che l'amministratore NON possiede
 *  (utile per messaggi d'errore chiari, es. "non hai i permessi: X, Y"). */
export async function chiaviNonPossedute(amministratoreId: string, chiaviRichieste: string[]): Promise<string[]> {
  const eff = await permessiEffettivi(amministratoreId);
  if (eff.owner) return [];
  return chiaviRichieste.filter((c) => !eff.permessi.has(c));
}
