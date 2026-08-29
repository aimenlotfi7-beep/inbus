ALTER TABLE "tour_leader" DROP CONSTRAINT "tour_leader_evento_riferimento_eventi_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tour_leader" ADD CONSTRAINT "tour_leader_evento_riferimento_eventi_id_fk" FOREIGN KEY ("evento_riferimento") REFERENCES "public"."eventi"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
