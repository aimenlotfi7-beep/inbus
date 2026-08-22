ALTER TABLE "partecipanti_prenotazione" ADD COLUMN IF NOT EXISTS "ticket_token" text;--> statement-breakpoint
ALTER TABLE "partecipanti_prenotazione" ADD COLUMN IF NOT EXISTS "ticket_utilizzato_il" timestamp;--> statement-breakpoint
ALTER TABLE "tour_leader" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partecipanti_prenotazione" ADD CONSTRAINT "partecipanti_prenotazione_ticket_token_unique" UNIQUE("ticket_token");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
