DO $$ BEGIN
 CREATE TYPE "public"."stato_disponibilita" AS ENUM('POCHI_POSTI', 'NUOVI_POSTI', 'ESAURITO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN "stato_disponibilita" "stato_disponibilita";--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "cognome" text;--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "linea_id" text;--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "fermata_id" text;--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "partecipanti_json" text;--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "email_inviata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD COLUMN "completata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prenotazioni" ADD COLUMN "promemoria_saldo_inviato" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lista_attesa" ADD CONSTRAINT "lista_attesa_linea_id_linee_bus_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee_bus"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lista_attesa" ADD CONSTRAINT "lista_attesa_fermata_id_fermate_id_fk" FOREIGN KEY ("fermata_id") REFERENCES "public"."fermate"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "lista_attesa" ADD CONSTRAINT "lista_attesa_token_unique" UNIQUE("token");