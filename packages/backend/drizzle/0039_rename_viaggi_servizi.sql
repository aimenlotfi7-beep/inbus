-- Rinomina "viaggi" in "servizi" (nel codice era già rinominato solo
-- nel testo mostrato all'utente — ora anche nel database, per
-- coerenza). ALTER TABLE RENAME, dati e prenotazioni esistenti restano
-- intatti.
ALTER TABLE IF EXISTS "viaggi" RENAME TO "servizi";--> statement-breakpoint
ALTER TABLE IF EXISTS "tragitti" RENAME COLUMN "viaggio_id" TO "servizio_id";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "servizi" RENAME CONSTRAINT "viaggi_evento_id_eventi_id_fk" TO "servizi_evento_id_eventi_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tragitti" RENAME CONSTRAINT "tragitti_viaggio_id_viaggi_id_fk" TO "tragitti_servizio_id_servizi_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;
