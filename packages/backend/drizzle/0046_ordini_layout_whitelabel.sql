CREATE TABLE IF NOT EXISTS "ordini" (
	"id" text PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"totale" numeric(10, 2) NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "ordine_id" text;--> statement-breakpoint
ALTER TABLE "white_label" ADD COLUMN "layout_biglietto_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ordini" ADD CONSTRAINT "ordini_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_ordine_id_ordini_id_fk" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "white_label" ADD CONSTRAINT "white_label_layout_biglietto_id_layout_biglietto_id_fk" FOREIGN KEY ("layout_biglietto_id") REFERENCES "public"."layout_biglietto"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
