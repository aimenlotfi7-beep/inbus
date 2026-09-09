DO $$ BEGIN
 CREATE TYPE "public"."compenso_fisso_per" AS ENUM('ACQUISTO', 'PASSEGGERO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."compenso_tipo" AS ENUM('PERCENTUALE', 'FISSO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoter_link" (
	"id" text PRIMARY KEY NOT NULL,
	"promoter_id" text NOT NULL,
	"evento_id" text NOT NULL,
	"codice" text NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promoter_link_codice_unique" UNIQUE("codice"),
	CONSTRAINT "promoter_link_unico" UNIQUE("promoter_id","evento_id")
);
--> statement-breakpoint
ALTER TABLE "coupon" ADD COLUMN "compenso_tipo" "compenso_tipo";--> statement-breakpoint
ALTER TABLE "coupon" ADD COLUMN "compenso_valore" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "coupon" ADD COLUMN "compenso_fisso_per" "compenso_fisso_per";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promoter_link" ADD CONSTRAINT "promoter_link_promoter_id_promoter_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoter"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promoter_link" ADD CONSTRAINT "promoter_link_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
