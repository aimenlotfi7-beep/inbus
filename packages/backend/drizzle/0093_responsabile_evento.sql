CREATE TABLE IF NOT EXISTS "evento_responsabile" (
	"evento_id" text PRIMARY KEY NOT NULL,
	"amministratore_id" text NOT NULL,
	"compenso_tipo" text DEFAULT 'FISSO' NOT NULL,
	"compenso_valore" numeric(10, 2) DEFAULT '0' NOT NULL,
	"assegnato_il" timestamp DEFAULT now() NOT NULL,
	"pagato_il" timestamp,
	"importo_pagato" numeric(10, 2)
);
--> statement-breakpoint
ALTER TABLE "amministratori" ADD COLUMN "solo_eventi_assegnati" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evento_responsabile" ADD CONSTRAINT "evento_responsabile_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evento_responsabile" ADD CONSTRAINT "evento_responsabile_amministratore_id_amministratori_id_fk" FOREIGN KEY ("amministratore_id") REFERENCES "public"."amministratori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evento_responsabile_amministratore_idx" ON "evento_responsabile" USING btree ("amministratore_id");