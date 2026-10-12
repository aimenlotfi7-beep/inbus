ALTER TABLE "prenotazioni" ADD COLUMN IF NOT EXISTS "fermata_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_fermata_id_fermate_id_fk" FOREIGN KEY ("fermata_id") REFERENCES "public"."fermate"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prenotazioni_fermata_idx" ON "prenotazioni" USING btree ("fermata_id");--> statement-breakpoint
-- Le prenotazioni già fatte: si collega la fermata SOLO dove il nome
-- della città la individua senza dubbi (una sola fermata con quel nome
-- in quel tragitto). Dove ce ne sono due omonime resta vuota e il
-- codice continua a usare il nome, come ha sempre fatto: meglio il
-- comportamento di prima che una fermata scelta a caso.
UPDATE "prenotazioni" p SET "fermata_id" = f."id"
FROM "fermate" f
WHERE f."tragitto_id" = p."tragitto_id"
  AND f."citta" = p."fermata_citta"
  AND p."fermata_id" IS NULL
  AND (SELECT count(*) FROM "fermate" f2 WHERE f2."tragitto_id" = p."tragitto_id" AND f2."citta" = p."fermata_citta") = 1;
