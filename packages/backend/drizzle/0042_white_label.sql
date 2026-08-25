CREATE TABLE IF NOT EXISTS "white_label" (
	"id" text PRIMARY KEY NOT NULL,
	"organizzatore_id" text NOT NULL,
	"evento_id" text NOT NULL,
	"public_widget_id" text NOT NULL,
	"attiva" boolean DEFAULT true NOT NULL,
	"domini_autorizzati" jsonb DEFAULT '[]' NOT NULL,
	"tema" jsonb DEFAULT '{}' NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	"aggiornato_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "white_label_public_widget_id_unique" UNIQUE("public_widget_id"),
	CONSTRAINT "white_label_org_evento_unico" UNIQUE("organizzatore_id","evento_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "white_label" ADD CONSTRAINT "white_label_organizzatore_id_organizzatori_id_fk" FOREIGN KEY ("organizzatore_id") REFERENCES "public"."organizzatori"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "white_label" ADD CONSTRAINT "white_label_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
