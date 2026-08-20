DO $$ BEGIN
 CREATE TYPE "public"."stato_ticket" AS ENUM('EMESSO', 'UTILIZZATO', 'ANNULLATO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "ticket_token" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "ticket_stato" "stato_ticket";--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "ticket_emesso_il" timestamp;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "ticket_utilizzato_il" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_ticket_token_unique" UNIQUE("ticket_token");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;