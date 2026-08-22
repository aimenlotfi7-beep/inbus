CREATE TABLE IF NOT EXISTS "movimenti_credito" (
	"id" text PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"importo" numeric(10, 2) NOT NULL,
	"motivo" text NOT NULL,
	"prenotazione_id" text,
	"creato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "credito_usato" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "credito_maturato" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN IF NOT EXISTS "credito_disponibile" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movimenti_credito" ADD CONSTRAINT "movimenti_credito_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movimenti_credito" ADD CONSTRAINT "movimenti_credito_prenotazione_id_prenotazioni_id_fk" FOREIGN KEY ("prenotazione_id") REFERENCES "public"."prenotazioni"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
