DO $$ BEGIN
 CREATE TYPE "public"."tipo_bundle" AS ENUM('FISSO', 'LIBERO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"descrizione" text,
	"copertina_url" text,
	"tipo" "tipo_bundle" NOT NULL,
	"min_eventi" integer,
	"max_eventi" integer,
	"min_posti" integer DEFAULT 1 NOT NULL,
	"max_posti" integer DEFAULT 10 NOT NULL,
	"sconto_percentuale" numeric(5, 2) NOT NULL,
	"ammette_offerte" boolean DEFAULT false NOT NULL,
	"ammette_credito" boolean DEFAULT false NOT NULL,
	"ammette_promoter" boolean DEFAULT false NOT NULL,
	"ammette_acconto" boolean DEFAULT false NOT NULL,
	"inizio_vendita" timestamp,
	"fine_vendita" timestamp,
	"visibile_se_programmato" boolean DEFAULT true NOT NULL,
	"visibile_se_terminato" boolean DEFAULT false NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL,
	"in_evidenza_home" boolean DEFAULT false NOT NULL,
	"organizzatore_id" text,
	"eliminato_il" timestamp,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bundle_eventi" (
	"bundle_id" text NOT NULL,
	"evento_id" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bundle_eventi_bundle_id_evento_id_pk" PRIMARY KEY("bundle_id","evento_id")
);
--> statement-breakpoint
ALTER TABLE "ordini" ADD COLUMN "bundle_id" text;--> statement-breakpoint
ALTER TABLE "ordini" ADD COLUMN "sconto_bundle" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "sconto_bundle" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "richieste_rimborso" ADD COLUMN "ordine_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bundle" ADD CONSTRAINT "bundle_organizzatore_id_organizzatori_id_fk" FOREIGN KEY ("organizzatore_id") REFERENCES "public"."organizzatori"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bundle_eventi" ADD CONSTRAINT "bundle_eventi_bundle_id_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bundle_eventi" ADD CONSTRAINT "bundle_eventi_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ordini" ADD CONSTRAINT "ordini_bundle_id_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "richieste_rimborso" ADD CONSTRAINT "richieste_rimborso_ordine_id_ordini_id_fk" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
