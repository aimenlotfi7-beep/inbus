CREATE TABLE IF NOT EXISTS "amministratore_permessi" (
	"amministratore_id" text NOT NULL,
	"permesso_chiave" text NOT NULL,
	"concesso" boolean NOT NULL,
	CONSTRAINT "amministratore_permessi_amministratore_id_permesso_chiave_pk" PRIMARY KEY("amministratore_id","permesso_chiave")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bus_fisici" (
	"id" text PRIMARY KEY NOT NULL,
	"fornitore_id" text,
	"riferimento" text NOT NULL,
	"autista_nome" text,
	"autista_telefono" text,
	"note" text,
	"creato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bus_tratte" (
	"bus_id" text NOT NULL,
	"linea_id" text NOT NULL,
	CONSTRAINT "bus_tratte_bus_id_linea_id_pk" PRIMARY KEY("bus_id","linea_id")
);
--> statement-breakpoint
ALTER TABLE "linee_bus" ADD COLUMN "coperta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "linee_bus" ADD COLUMN "note_coperta" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "amministratore_permessi" ADD CONSTRAINT "amministratore_permessi_amministratore_id_amministratori_id_fk" FOREIGN KEY ("amministratore_id") REFERENCES "public"."amministratori"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "amministratore_permessi" ADD CONSTRAINT "amministratore_permessi_permesso_chiave_permessi_chiave_fk" FOREIGN KEY ("permesso_chiave") REFERENCES "public"."permessi"("chiave") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_fisici" ADD CONSTRAINT "bus_fisici_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_tratte" ADD CONSTRAINT "bus_tratte_bus_id_bus_fisici_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus_fisici"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_tratte" ADD CONSTRAINT "bus_tratte_linea_id_linee_bus_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee_bus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
