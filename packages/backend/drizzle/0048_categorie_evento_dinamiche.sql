CREATE TABLE IF NOT EXISTS "categorie_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	CONSTRAINT "categorie_evento_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "eventi" ALTER COLUMN "categoria" SET DATA TYPE text;
--> statement-breakpoint
-- Le 3 categorie che c'erano fisse finora, come punto di partenza —
-- l'admin può aggiungerne altre dal gestionale, queste tre restano
-- comunque disponibili da subito, nessuna sparisce.
INSERT INTO "categorie_evento" ("id", "nome") VALUES
  ('seed-categoria-concerti', 'Concerti'),
  ('seed-categoria-festival', 'Festival'),
  ('seed-categoria-sport', 'Sport')
ON CONFLICT ("nome") DO NOTHING;
--> statement-breakpoint
-- Gli eventi che avevano già una categoria coi vecchi valori
-- dell'enum (in MAIUSCOLO) ora la ritrovano scritta come le altre
-- (prima lettera maiuscola), coerente col resto del sito.
UPDATE "eventi" SET "categoria" = 'Concerti' WHERE "categoria" = 'CONCERTI';
UPDATE "eventi" SET "categoria" = 'Festival' WHERE "categoria" = 'FESTIVAL';
UPDATE "eventi" SET "categoria" = 'Sport' WHERE "categoria" = 'SPORT';