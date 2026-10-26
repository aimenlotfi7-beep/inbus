-- La soglia di pareggio per evento e per tragitto (vuote = vale quella di
-- Impostazioni). Nessun dato esistente viene toccato.
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "soglia_pareggio" integer;--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN IF NOT EXISTS "soglia_pareggio" integer;
