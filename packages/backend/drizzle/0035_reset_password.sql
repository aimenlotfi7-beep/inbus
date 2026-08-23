ALTER TABLE "amministratori" ADD COLUMN IF NOT EXISTS "token_reset_password" text;--> statement-breakpoint
ALTER TABLE "amministratori" ADD COLUMN IF NOT EXISTS "token_reset_password_scadenza" timestamp;--> statement-breakpoint
ALTER TABLE "promoter" ADD COLUMN IF NOT EXISTS "token_reset_password" text;--> statement-breakpoint
ALTER TABLE "promoter" ADD COLUMN IF NOT EXISTS "token_reset_password_scadenza" timestamp;--> statement-breakpoint
ALTER TABLE "tour_leader" ADD COLUMN IF NOT EXISTS "token_reset_password" text;--> statement-breakpoint
ALTER TABLE "tour_leader" ADD COLUMN IF NOT EXISTS "token_reset_password_scadenza" timestamp;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "token_reset_password" text;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "token_reset_password_scadenza" timestamp;