DO $$ BEGIN
 CREATE TYPE "public"."tipo_fermata" AS ENUM('PARTENZA', 'PASSAGGIO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "stato_tragitto" ADD VALUE 'PREZZATO';--> statement-breakpoint
ALTER TABLE "fermate" ADD COLUMN "tipo" "tipo_fermata" DEFAULT 'PASSAGGIO' NOT NULL;--> statement-breakpoint
ALTER TABLE "fermate" ADD COLUMN "soglia_minima" integer;--> statement-breakpoint
ALTER TABLE "fermate" ADD COLUMN "attivo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "preventivo_costo" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "preventivo_posti_bus" integer;