ALTER TABLE "bus_fisici" ADD COLUMN "tour_leader_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_fisici" ADD CONSTRAINT "bus_fisici_tour_leader_id_tour_leader_id_fk" FOREIGN KEY ("tour_leader_id") REFERENCES "public"."tour_leader"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
