DO $$ BEGIN
 CREATE TYPE "public"."stato_tragitto" AS ENUM('DA_CONFERMARE', 'CONFERMATO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "stato" "stato_tragitto" DEFAULT 'DA_CONFERMARE' NOT NULL;
--> statement-breakpoint
-- Salvaguardia: tutti i tragitti che esistono già (creati prima di
-- questa migrazione) vengono considerati "già confermati" — hanno
-- sempre venduto normalmente finora sotto le vecchie regole, bloccarli
-- di colpo in attesa di un bus da registrare adesso interromperebbe
-- vendite già in corso senza nessun preavviso. La nuova regola (nasce
-- DA_CONFERMARE) si applica solo ai tragitti creati DA ORA in poi.
UPDATE "tragitti" SET "stato" = 'CONFERMATO';