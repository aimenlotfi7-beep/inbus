ALTER TABLE "prenotazioni" ADD COLUMN "cancellata_il" timestamp;--> statement-breakpoint
-- Le prenotazioni già cancellate con un rimborso approvato prendono la data
-- in cui è stato approvato; le altre cancellazioni vecchie restano senza data.
UPDATE "prenotazioni" AS p
SET "cancellata_il" = r."gestita_il"
FROM "richieste_rimborso" AS r
WHERE r."prenotazione_id" = p."id"
  AND r."stato" = 'APPROVATA'
  AND r."gestita_il" IS NOT NULL
  AND p."stato" = 'CANCELLATA'
  AND p."cancellata_il" IS NULL;
