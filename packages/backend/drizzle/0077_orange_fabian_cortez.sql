ALTER TABLE "coupon" ADD COLUMN "promoter_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon" ADD CONSTRAINT "coupon_promoter_id_promoter_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoter"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
