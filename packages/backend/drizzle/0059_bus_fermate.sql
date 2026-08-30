CREATE TABLE IF NOT EXISTS "bus_fermate" (
	"bus_id" text NOT NULL,
	"fermata_id" text NOT NULL,
	CONSTRAINT "bus_fermate_bus_id_fermata_id_pk" PRIMARY KEY("bus_id","fermata_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_fermate" ADD CONSTRAINT "bus_fermate_bus_id_bus_fisici_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus_fisici"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_fermate" ADD CONSTRAINT "bus_fermate_fermata_id_fermate_id_fk" FOREIGN KEY ("fermata_id") REFERENCES "public"."fermate"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
