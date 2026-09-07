ALTER TABLE "white_label" ALTER COLUMN "evento_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "white_label" ADD COLUMN "bundle_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "white_label" ADD CONSTRAINT "white_label_bundle_id_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
