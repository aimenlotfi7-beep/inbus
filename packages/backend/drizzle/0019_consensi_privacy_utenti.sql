ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "presa_visione_informativa" boolean;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "presa_visione_informativa_data" timestamp;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "consenso_marketing" boolean;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "consenso_marketing_data" timestamp;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "consenso_profilazione" boolean;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "consenso_profilazione_data" timestamp;