ALTER TABLE "preventivi_richieste" ADD COLUMN "scopo" text DEFAULT 'QUOTAZIONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "preventivi_richieste" ADD COLUMN "linea_id" text;--> statement-breakpoint
ALTER TABLE "preventivi_richieste" ADD COLUMN "fermate_ids" jsonb;--> statement-breakpoint
ALTER TABLE "preventivi_richieste" ADD COLUMN "chiusa_il" timestamp;--> statement-breakpoint
ALTER TABLE "preventivi_risposte" ADD COLUMN "posti_bus" integer;--> statement-breakpoint
ALTER TABLE "preventivi_risposte" ADD COLUMN "bus_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preventivi_richieste" ADD CONSTRAINT "preventivi_richieste_linea_id_linee_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preventivi_risposte" ADD CONSTRAINT "preventivi_risposte_bus_id_bus_fisici_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus_fisici"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
