CREATE TABLE IF NOT EXISTS "comunicazioni" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"oggetto" text NOT NULL,
	"corpo" text NOT NULL,
	"filtro_servizio_ids" jsonb DEFAULT '[]' NOT NULL,
	"filtro_tragitto_id" text,
	"filtro_fermata_id" text,
	"canali" jsonb DEFAULT '[]' NOT NULL,
	"numero_destinatari" integer DEFAULT 0 NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comunicazioni" ADD CONSTRAINT "comunicazioni_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
