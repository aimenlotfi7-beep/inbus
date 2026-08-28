CREATE TABLE IF NOT EXISTS "fermate_anagrafica" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"citta" text NOT NULL,
	"indirizzo" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "fermate" ADD COLUMN "fermata_anagrafica_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fermate" ADD CONSTRAINT "fermate_fermata_anagrafica_id_fermate_anagrafica_id_fk" FOREIGN KEY ("fermata_anagrafica_id") REFERENCES "public"."fermate_anagrafica"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Popolo l'anagrafica dalle fermate già esistenti — una voce per ogni
-- combinazione distinta di città+indirizzo (senza badare a
-- maiuscole/spazi in eccesso nel confronto, ma salvando il testo
-- originale) — prendo le coordinate dalla prima riga del gruppo che
-- le ha (se nessuna le ha, restano vuote, si possono aggiungere dopo
-- a mano dalla nuova schermata). ID generato con una funzione sempre
-- disponibile in Postgres, senza bisogno di estensioni esterne.
INSERT INTO "fermate_anagrafica" ("id", "nome", "citta", "indirizzo", "lat", "lng")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || citta || indirizzo), 1, 24),
  citta,
  citta,
  indirizzo,
  (array_agg(lat) FILTER (WHERE lat IS NOT NULL))[1],
  (array_agg(lng) FILTER (WHERE lng IS NOT NULL))[1]
FROM "fermate"
GROUP BY lower(trim(citta)), lower(trim(indirizzo)), citta, indirizzo;
--> statement-breakpoint
-- Ricollego ogni fermata esistente alla voce di anagrafica giusta,
-- confrontando città+indirizzo con lo stesso criterio usato sopra per
-- raggrupparle.
UPDATE "fermate" f
SET "fermata_anagrafica_id" = fa."id"
FROM "fermate_anagrafica" fa
WHERE lower(trim(f.citta)) = lower(trim(fa.citta))
  AND lower(trim(f.indirizzo)) = lower(trim(fa.indirizzo));
