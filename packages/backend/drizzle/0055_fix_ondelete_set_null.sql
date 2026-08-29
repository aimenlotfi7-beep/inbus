ALTER TABLE "bus_fisici" DROP CONSTRAINT "bus_fisici_fornitore_id_fornitori_id_fk";
--> statement-breakpoint
ALTER TABLE "log_attivita" DROP CONSTRAINT "log_attivita_amministratore_id_amministratori_id_fk";
--> statement-breakpoint
ALTER TABLE "tragitti" DROP CONSTRAINT "tragitti_fornitore_id_fornitori_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_fisici" ADD CONSTRAINT "bus_fisici_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "log_attivita" ADD CONSTRAINT "log_attivita_amministratore_id_amministratori_id_fk" FOREIGN KEY ("amministratore_id") REFERENCES "public"."amministratori"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tragitti" ADD CONSTRAINT "tragitti_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
