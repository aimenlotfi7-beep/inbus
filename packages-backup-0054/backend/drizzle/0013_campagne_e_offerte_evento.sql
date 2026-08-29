CREATE TABLE IF NOT EXISTS "campagne" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"piattaforma" text,
	"tipo" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"attiva" boolean DEFAULT true NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offerte_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"campagna_id" text,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"prezzo" numeric(10, 2) NOT NULL,
	"prezzo_originale" numeric(10, 2),
	"attiva" boolean DEFAULT true NOT NULL,
	"valido_dal" timestamp,
	"valido_al" timestamp,
	"limite_utilizzi" integer,
	"utilizzi" integer DEFAULT 0 NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offerte_evento_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "offerta_id" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "campagna_id" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "utm_content" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offerte_evento" ADD CONSTRAINT "offerte_evento_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offerte_evento" ADD CONSTRAINT "offerte_evento_campagna_id_campagne_id_fk" FOREIGN KEY ("campagna_id") REFERENCES "public"."campagne"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_offerta_id_offerte_evento_id_fk" FOREIGN KEY ("offerta_id") REFERENCES "public"."offerte_evento"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_campagna_id_campagne_id_fk" FOREIGN KEY ("campagna_id") REFERENCES "public"."campagne"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
