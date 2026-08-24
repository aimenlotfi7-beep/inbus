-- Rinomina "linee_bus" in "tragitti" (era il nome del codice, non
-- coincideva con "Tragitti" mostrato nell'interfaccia) — e tutte le
-- colonne linea_id -> tragitto_id nelle tabelle collegate. ALTER TABLE
-- RENAME apposta, dati e prenotazioni esistenti restano intatti. I
-- vincoli sono avvolti in blocchi che ignorano l'errore se il nome
-- esatto non corrisponde (non blocca comunque il resto della
-- migrazione, che è la parte che conta davvero).
ALTER TABLE IF EXISTS "linee_bus" RENAME TO "tragitti";--> statement-breakpoint
ALTER TABLE IF EXISTS "fermate" RENAME COLUMN "linea_id" TO "tragitto_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "bus_tratte" RENAME COLUMN "linea_id" TO "tragitto_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "prenotazioni" RENAME COLUMN "linea_id" TO "tragitto_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "lista_attesa" RENAME COLUMN "linea_id" TO "tragitto_id";--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "tragitti" RENAME CONSTRAINT "linee_bus_evento_id_eventi_id_fk" TO "tragitti_evento_id_eventi_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tragitti" RENAME CONSTRAINT "linee_bus_viaggio_id_viaggi_id_fk" TO "tragitti_viaggio_id_viaggi_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tragitti" RENAME CONSTRAINT "linee_bus_fornitore_id_fornitori_id_fk" TO "tragitti_fornitore_id_fornitori_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "fermate" RENAME CONSTRAINT "fermate_linea_id_linee_bus_id_fk" TO "fermate_tragitto_id_tragitti_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bus_tratte" RENAME CONSTRAINT "bus_tratte_linea_id_linee_bus_id_fk" TO "bus_tratte_tragitto_id_tragitti_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prenotazioni" RENAME CONSTRAINT "prenotazioni_linea_id_linee_bus_id_fk" TO "prenotazioni_tragitto_id_tragitti_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lista_attesa" RENAME CONSTRAINT "lista_attesa_linea_id_linee_bus_id_fk" TO "lista_attesa_tragitto_id_tragitti_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bus_tratte" RENAME CONSTRAINT "bus_tratte_bus_id_linea_id_pk" TO "bus_tratte_bus_id_tragitto_id_pk";
EXCEPTION WHEN undefined_object THEN null; END $$;
