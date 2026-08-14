import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { amministratori, ruoli, ruoloPermessi } from '../../db/schema.js';

export interface PermessiEffettivi {
  owner: boolean;
  permessi: Set<string>; // ignorato/irrilevante se owner === true
}

/** Calcola i permessi effettivi di un amministratore in base al suo ruolo.
 *  Un ruolo "owner" ha sempre tutti i permessi, presenti e futuri. */
export async function permessiEffettivi(amministratoreId: string): Promise<PermessiEffettivi> {
  const [admin] = await db
    .select({ ruoloId: amministratori.ruoloId })
    .from(amministratori)
    .where(eq(amministratori.id, amministratoreId))
    .limit(1);

  if (!admin) return { owner: false, permessi: new Set() };

  const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, admin.ruoloId)).limit(1);
  if (!ruolo) return { owner: false, permessi: new Set() };
  if (ruolo.owner) return { owner: true, permessi: new Set() };

  const righe = await db
    .select({ chiave: ruoloPermessi.permessoChiave })
    .from(ruoloPermessi)
    .where(eq(ruoloPermessi.ruoloId, ruolo.id));

  return { owner: false, permessi: new Set(righe.map((r) => r.chiave)) };
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
