CREATE TABLE IF NOT EXISTS "regole_commissione" (
	"id" text PRIMARY KEY NOT NULL,
	"organizzatore_id" text NOT NULL,
	"percentuale" numeric(5, 2) NOT NULL,
	"valido_dal" timestamp DEFAULT now() NOT NULL,
	"valido_a" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regole_commissione" ADD CONSTRAINT "regole_commissione_organizzatore_id_organizzatori_id_fk" FOREIGN KEY ("organizzatore_id") REFERENCES "public"."organizzatori"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
