-- Da eseguire SOLO DOPO aver lanciato lo script di backfill
-- (npx tsx src/db/migra-permessi.ts oppure npm run seed su DB nuovo),
-- così ogni riga di "amministratori" ha già un ruolo_id valorizzato.
ALTER TABLE "amministratori" ALTER COLUMN "ruolo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "amministratori" DROP COLUMN IF EXISTS "ruolo";
