DO $$ BEGIN
 CREATE TYPE "public"."origine_richiesta_rimborso" AS ENUM('CLIENTE', 'VARIAZIONE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."stato_variazione" AS ENUM('IN_CORSO', 'GESTITA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variazioni" (
	"id" text PRIMARY KEY NOT NULL,
	"tragitto_id" text NOT NULL,
	"fermata_descrizione" text NOT NULL,
	"descrizione" text NOT NULL,
	"stato" "stato_variazione" DEFAULT 'IN_CORSO' NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variazioni_risposte" (
	"id" text PRIMARY KEY NOT NULL,
	"variazione_id" text NOT NULL,
	"prenotazione_id" text NOT NULL,
	"token" text NOT NULL,
	"risposta" text,
	"risposto_il" timestamp,
	CONSTRAINT "variazioni_risposte_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "richieste_rimborso" ADD COLUMN "origine" "origine_richiesta_rimborso" DEFAULT 'CLIENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "richieste_rimborso" ADD COLUMN "variazione_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variazioni" ADD CONSTRAINT "variazioni_tragitto_id_tragitti_id_fk" FOREIGN KEY ("tragitto_id") REFERENCES "public"."tragitti"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variazioni_risposte" ADD CONSTRAINT "variazioni_risposte_variazione_id_variazioni_id_fk" FOREIGN KEY ("variazione_id") REFERENCES "public"."variazioni"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variazioni_risposte" ADD CONSTRAINT "variazioni_risposte_prenotazione_id_prenotazioni_id_fk" FOREIGN KEY ("prenotazione_id") REFERENCES "public"."prenotazioni"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "richieste_rimborso" ADD CONSTRAINT "richieste_rimborso_variazione_id_variazioni_id_fk" FOREIGN KEY ("variazione_id") REFERENCES "public"."variazioni"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
