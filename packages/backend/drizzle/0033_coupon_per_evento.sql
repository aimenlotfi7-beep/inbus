ALTER TABLE "coupon" ADD COLUMN IF NOT EXISTS "evento_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon" ADD CONSTRAINT "coupon_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
