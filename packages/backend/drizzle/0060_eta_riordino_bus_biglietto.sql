ALTER TABLE "prenotazioni" ADD COLUMN "bus_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_bus_id_bus_fisici_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus_fisici"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
