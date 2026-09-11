ALTER TABLE "preventivi_richieste" ADD COLUMN "per_cambio_percorso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "fermate_preventivo" jsonb;--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "percorso_preventivo_il" timestamp;--> statement-breakpoint
-- Per i tragitti che hanno già un preventivo, il percorso di adesso diventa quello del preventivo: da qui in poi ogni fermata tolta o aggiunta viene segnalata in viola.
UPDATE "tragitti" t SET "fermate_preventivo" = COALESCE((SELECT jsonb_agg(f."citta" ORDER BY f."ordine") FROM "fermate" f WHERE f."tragitto_id" = t."id" AND f."attivo"), '[]'::jsonb) WHERE t."preventivo_costo" IS NOT NULL;