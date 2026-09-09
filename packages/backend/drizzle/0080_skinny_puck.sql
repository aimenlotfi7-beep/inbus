CREATE TABLE IF NOT EXISTS "tour" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"copertina_url" text,
	"eliminato_il" timestamp,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tour_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tour_eventi" (
	"tour_id" text NOT NULL,
	"evento_id" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tour_eventi_tour_id_evento_id_pk" PRIMARY KEY("tour_id","evento_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tour_eventi" ADD CONSTRAINT "tour_eventi_tour_id_tour_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tour"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tour_eventi" ADD CONSTRAINT "tour_eventi_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
