CREATE TABLE IF NOT EXISTS "partecipanti_prenotazione" (
	"id" text PRIMARY KEY NOT NULL,
	"prenotazione_id" text NOT NULL,
	"nome" text NOT NULL,
	"cognome" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventi" ALTER COLUMN "prezzo" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partecipanti_prenotazione" ADD CONSTRAINT "partecipanti_prenotazione_prenotazione_id_prenotazioni_id_fk" FOREIGN KEY ("prenotazione_id") REFERENCES "public"."prenotazioni"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
