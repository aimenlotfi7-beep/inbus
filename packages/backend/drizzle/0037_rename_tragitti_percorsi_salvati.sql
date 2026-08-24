-- Rinomina "tragitti"/"fermate_tragitto" (i vecchi percorsi salvati
-- riutilizzabili) in "percorsi_salvati"/"fermate_percorso_salvato" —
-- libera il nome "tragitti" per le vere tratte dell'evento (vedi
-- prossima migrazione). ALTER TABLE RENAME, dati intatti.
ALTER TABLE IF EXISTS "tragitti" RENAME TO "percorsi_salvati";--> statement-breakpoint
ALTER TABLE IF EXISTS "fermate_tragitto" RENAME TO "fermate_percorso_salvato";--> statement-breakpoint
ALTER TABLE IF EXISTS "fermate_percorso_salvato" RENAME COLUMN "tragitto_id" TO "percorso_salvato_id";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fermate_percorso_salvato" RENAME CONSTRAINT "fermate_tragitto_tragitto_id_tragitti_id_fk" TO "fermate_percorso_salvato_percorso_salvato_id_percorsi_salvati_id_fk";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
