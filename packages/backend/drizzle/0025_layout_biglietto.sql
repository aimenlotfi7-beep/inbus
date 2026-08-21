CREATE TABLE IF NOT EXISTS "layout_biglietto" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"predefinito" boolean DEFAULT false NOT NULL,
	"configurazione" text NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	"aggiornato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "layout_biglietto_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventi" ADD CONSTRAINT "eventi_layout_biglietto_id_layout_biglietto_id_fk" FOREIGN KEY ("layout_biglietto_id") REFERENCES "public"."layout_biglietto"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
