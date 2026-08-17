-- Sistema direttamente la tabella offerte_evento, bypassando il
-- tracciamento di Drizzle (che per qualche motivo pensa di aver già
-- applicato questa modifica, anche se non è mai avvenuta davvero).
-- Sicuro da rilanciare più volte: usa IF NOT EXISTS / IF EXISTS.

ALTER TABLE "offerte_evento" ADD COLUMN IF NOT EXISTS "sconto_percentuale" numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE "offerte_evento" ALTER COLUMN "sconto_percentuale" DROP DEFAULT;
ALTER TABLE "offerte_evento" DROP COLUMN IF EXISTS "prezzo";
ALTER TABLE "offerte_evento" DROP COLUMN IF EXISTS "prezzo_originale";
