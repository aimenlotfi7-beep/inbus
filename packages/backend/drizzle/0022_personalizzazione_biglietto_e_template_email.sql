CREATE TABLE IF NOT EXISTS "template_email" (
	"chiave" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"oggetto" text NOT NULL,
	"corpo" text NOT NULL,
	"aggiornato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "ticket_colore_accento" text;--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "ticket_immagine_sfondo_url" text;