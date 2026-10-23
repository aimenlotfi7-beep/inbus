-- Le due date del piano bus, per evento (vuote = valgono i giorni
-- impostati in Impostazioni). Nessun dato esistente viene toccato.
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "decisione_piano_il" timestamp;--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "fine_vendite_il" timestamp;
