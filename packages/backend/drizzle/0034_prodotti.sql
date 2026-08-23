CREATE TABLE IF NOT EXISTS "prodotti" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"nome" text NOT NULL,
	"arrivo_orario" text,
	"ordine" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linee_bus" ADD COLUMN IF NOT EXISTS "prodotto_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prodotti" ADD CONSTRAINT "prodotti_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linee_bus" ADD CONSTRAINT "linee_bus_prodotto_id_prodotti_id_fk" FOREIGN KEY ("prodotto_id") REFERENCES "public"."prodotti"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
