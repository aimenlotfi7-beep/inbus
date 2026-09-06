DO $$ BEGIN
 CREATE TYPE "public"."stato_fornitore" AS ENUM('IN_ATTESA', 'APPROVATO', 'DISATTIVATO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fornitori_campi_extra_config" (
	"id" text PRIMARY KEY NOT NULL,
	"etichetta" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fornitori" ADD COLUMN "stato" "stato_fornitore" DEFAULT 'APPROVATO' NOT NULL;--> statement-breakpoint
ALTER TABLE "fornitori" ADD COLUMN "invio_automatico" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fornitori" ADD COLUMN "campi_extra" jsonb;--> statement-breakpoint
ALTER TABLE "fornitori" ADD COLUMN "creato_il" timestamp DEFAULT now() NOT NULL;