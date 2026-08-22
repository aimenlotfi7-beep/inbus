ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "email_verificata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "token_verifica_email" text;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "token_verifica_scadenza" timestamp;