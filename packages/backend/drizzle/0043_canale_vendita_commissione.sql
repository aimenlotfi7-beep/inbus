DO $$ BEGIN
 CREATE TYPE "public"."canale_vendita" AS ENUM('INBUS', 'WHITE_LABEL', 'DIRECT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "canale_vendita" "canale_vendita" DEFAULT 'INBUS' NOT NULL;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "white_label_id" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "commissione_percentuale_snapshot" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "commissione_importo_snapshot" numeric(10, 2);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_white_label_id_white_label_id_fk" FOREIGN KEY ("white_label_id") REFERENCES "public"."white_label"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
