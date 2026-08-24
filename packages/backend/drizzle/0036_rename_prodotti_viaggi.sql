-- Rinomina "prodotti" in "viaggi" (nel codice era già rinominato solo
-- nel testo mostrato all'utente — ora anche nel database, per
-- coerenza). ALTER TABLE RENAME apposta, non drop+create: i dati
-- esistenti (se già creato qualche viaggio) restano intatti.
ALTER TABLE IF EXISTS "prodotti" RENAME TO "viaggi";--> statement-breakpoint
ALTER TABLE IF EXISTS "linee_bus" RENAME COLUMN "prodotto_id" TO "viaggio_id";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "viaggi" RENAME CONSTRAINT "prodotti_evento_id_eventi_id_fk" TO "viaggi_evento_id_eventi_id_fk";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "linee_bus" RENAME CONSTRAINT "linee_bus_prodotto_id_prodotti_id_fk" TO "linee_bus_viaggio_id_viaggi_id_fk";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
