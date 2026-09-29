DO $$ BEGIN
 CREATE TYPE "public"."metodo_pagamento_fornitore" AS ENUM('BONIFICO', 'CONTANTI', 'CARTA', 'ALTRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."origine_spesa_fornitore" AS ENUM('BUS', 'MANUALE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pagamenti_fornitore" (
	"id" text PRIMARY KEY NOT NULL,
	"spesa_id" text NOT NULL,
	"importo" numeric(10, 2) NOT NULL,
	"pagato_il" timestamp NOT NULL,
	"metodo" "metodo_pagamento_fornitore" DEFAULT 'BONIFICO' NOT NULL,
	"riferimento" text,
	"note" text,
	"registrato_da" text,
	"creato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spese_fornitore" (
	"id" text PRIMARY KEY NOT NULL,
	"fornitore_id" text NOT NULL,
	"evento_id" text,
	"bus_id" text,
	"origine" "origine_spesa_fornitore" DEFAULT 'MANUALE' NOT NULL,
	"descrizione" text NOT NULL,
	"importo" numeric(10, 2) NOT NULL,
	"numero_fattura" text,
	"data_fattura" timestamp,
	"scadenza" timestamp,
	"fattura_url" text,
	"note" text,
	"annullata" boolean DEFAULT false NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pagamenti_fornitore" ADD CONSTRAINT "pagamenti_fornitore_spesa_id_spese_fornitore_id_fk" FOREIGN KEY ("spesa_id") REFERENCES "public"."spese_fornitore"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pagamenti_fornitore" ADD CONSTRAINT "pagamenti_fornitore_registrato_da_amministratori_id_fk" FOREIGN KEY ("registrato_da") REFERENCES "public"."amministratori"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spese_fornitore" ADD CONSTRAINT "spese_fornitore_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spese_fornitore" ADD CONSTRAINT "spese_fornitore_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spese_fornitore" ADD CONSTRAINT "spese_fornitore_bus_id_bus_fisici_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus_fisici"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagamenti_fornitore_spesa_idx" ON "pagamenti_fornitore" USING btree ("spesa_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spese_fornitore_una_per_bus" ON "spese_fornitore" USING btree ("bus_id") WHERE "spese_fornitore"."bus_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spese_fornitore_fornitore_idx" ON "spese_fornitore" USING btree ("fornitore_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spese_fornitore_evento_idx" ON "spese_fornitore" USING btree ("evento_id");--> statement-breakpoint
-- Importi sempre positivi: una spesa o un pagamento a zero (o negativo)
-- sarebbe solo un errore di inserimento, e falserebbe tutti i totali.
DO $$ BEGIN
 ALTER TABLE "spese_fornitore" ADD CONSTRAINT "spese_fornitore_importo_positivo" CHECK ("importo" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pagamenti_fornitore" ADD CONSTRAINT "pagamenti_fornitore_importo_positivo" CHECK ("importo" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;