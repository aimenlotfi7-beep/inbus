ALTER TABLE "lista_attesa" DROP CONSTRAINT "lista_attesa_linea_id_linee_bus_id_fk";
--> statement-breakpoint
ALTER TABLE "lista_attesa" DROP CONSTRAINT "lista_attesa_fermata_id_fermate_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lista_attesa" ADD CONSTRAINT "lista_attesa_linea_id_linee_bus_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee_bus"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lista_attesa" ADD CONSTRAINT "lista_attesa_fermata_id_fermate_id_fk" FOREIGN KEY ("fermata_id") REFERENCES "public"."fermate"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
