DO $$ BEGIN
 CREATE TYPE "public"."tipo_invio_richiesta" AS ENUM('AUTOMATICO', 'MANUALE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preventivi_richieste" (
	"id" text PRIMARY KEY NOT NULL,
	"tragitto_id" text NOT NULL,
	"fornitore_id" text NOT NULL,
	"token" text NOT NULL,
	"tipo_invio" "tipo_invio_richiesta" NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preventivi_richieste_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preventivi_risposte" (
	"id" text PRIMARY KEY NOT NULL,
	"richiesta_id" text NOT NULL,
	"prezzo" numeric(10, 2) NOT NULL,
	"file_nome" text,
	"file_contenuto" text,
	"file_firmato_nome" text,
	"file_firmato_contenuto" text,
	"file_firmato_inviato_il" timestamp,
	"inviata_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preventivi_risposte_richiesta_id_unique" UNIQUE("richiesta_id")
);
--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "partenza_lat" double precision;--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "partenza_lng" double precision;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preventivi_richieste" ADD CONSTRAINT "preventivi_richieste_tragitto_id_tragitti_id_fk" FOREIGN KEY ("tragitto_id") REFERENCES "public"."tragitti"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preventivi_richieste" ADD CONSTRAINT "preventivi_richieste_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preventivi_risposte" ADD CONSTRAINT "preventivi_risposte_richiesta_id_preventivi_richieste_id_fk" FOREIGN KEY ("richiesta_id") REFERENCES "public"."preventivi_richieste"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
