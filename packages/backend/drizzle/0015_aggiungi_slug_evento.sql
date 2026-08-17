-- Aggiunge lo slug in modo sicuro anche se ci sono già eventi: prima
-- nullable, poi genera uno slug leggibile e univoco per ogni riga
-- esistente (artista+città, con un pezzo di id per garantire unicità
-- anche se due eventi hanno artista/città identici), solo dopo impone
-- NOT NULL + UNIQUE. Non tocca gli accenti (nessuna estensione
-- richiesta): nell'improbabile caso di un nome con lettere accentate,
-- lo slug generato qui le mantiene — cosmetico, non bloccante. I nuovi
-- eventi creati da qui in poi avranno comunque lo slug ripulito bene
-- dal codice dell'applicazione.
ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
UPDATE "eventi" SET "slug" =
  trim(both '-' from regexp_replace(lower(artista || '-' || citta), '[^a-z0-9]+', '-', 'g'))
  || '-' || substr(id, 1, 6)
WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "eventi" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "eventi" ADD CONSTRAINT "eventi_slug_unique" UNIQUE("slug");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;