CREATE TABLE IF NOT EXISTS "linea_fermate" (
	"linea_id" text NOT NULL,
	"fermata_id" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "linea_fermate_linea_id_fermata_id_pk" PRIMARY KEY("linea_id","fermata_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linee" (
	"id" text PRIMARY KEY NOT NULL,
	"tragitto_id" text NOT NULL,
	"nome" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bus_fisici" ADD COLUMN "linea_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linea_fermate" ADD CONSTRAINT "linea_fermate_linea_id_linee_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linea_fermate" ADD CONSTRAINT "linea_fermate_fermata_id_fermate_id_fk" FOREIGN KEY ("fermata_id") REFERENCES "public"."fermate"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linee" ADD CONSTRAINT "linee_tragitto_id_tragitti_id_fk" FOREIGN KEY ("tragitto_id") REFERENCES "public"."tragitti"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_fisici" ADD CONSTRAINT "bus_fisici_linea_id_linee_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
