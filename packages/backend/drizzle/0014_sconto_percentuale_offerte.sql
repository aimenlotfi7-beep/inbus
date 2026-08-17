ALTER TABLE "offerte_evento" ADD COLUMN "sconto_percentuale" numeric(5, 2) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "offerte_evento" ALTER COLUMN "sconto_percentuale" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "offerte_evento" DROP COLUMN IF EXISTS "prezzo";--> statement-breakpoint
ALTER TABLE "offerte_evento" DROP COLUMN IF EXISTS "prezzo_originale";