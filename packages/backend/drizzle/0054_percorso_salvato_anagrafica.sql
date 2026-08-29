ALTER TABLE "fermate_percorso_salvato" ADD COLUMN "fermata_anagrafica_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fermate_percorso_salvato" ADD CONSTRAINT "fermate_percorso_salvato_fermata_anagrafica_id_fermate_anagrafica_id_fk" FOREIGN KEY ("fermata_anagrafica_id") REFERENCES "public"."fermate_anagrafica"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
