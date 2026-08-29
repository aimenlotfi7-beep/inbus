CREATE TABLE IF NOT EXISTS "permessi" (
	"chiave" text PRIMARY KEY NOT NULL,
	"etichetta" text NOT NULL,
	"modulo" text NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ruoli" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descrizione" text,
	"owner" boolean DEFAULT false NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ruoli_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ruolo_permessi" (
	"ruolo_id" text NOT NULL,
	"permesso_chiave" text NOT NULL,
	CONSTRAINT "ruolo_permessi_ruolo_id_permesso_chiave_pk" PRIMARY KEY("ruolo_id","permesso_chiave")
);
--> statement-breakpoint
-- NOTA: questa colonna è temporaneamente nullable. Diventa NOT NULL nella
-- migrazione 0002, DOPO aver eseguito lo script di backfill dati
-- (npx tsx src/db/migra-permessi.ts) che valorizza ruolo_id per ogni riga
-- esistente in base al vecchio campo `ruolo`. Se il database è nuovo
-- (nessuna riga in amministratori), puoi anche saltare direttamente al
-- seed (npm run seed) invece del backfill.
ALTER TABLE "amministratori" ADD COLUMN "ruolo_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ruolo_permessi" ADD CONSTRAINT "ruolo_permessi_ruolo_id_ruoli_id_fk" FOREIGN KEY ("ruolo_id") REFERENCES "public"."ruoli"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ruolo_permessi" ADD CONSTRAINT "ruolo_permessi_permesso_chiave_permessi_chiave_fk" FOREIGN KEY ("permesso_chiave") REFERENCES "public"."permessi"("chiave") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "amministratori" ADD CONSTRAINT "amministratori_ruolo_id_ruoli_id_fk" FOREIGN KEY ("ruolo_id") REFERENCES "public"."ruoli"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- La vecchia colonna "ruolo" NON viene eliminata qui: serve ancora allo
-- script di backfill. Viene eliminata nella migrazione 0002.