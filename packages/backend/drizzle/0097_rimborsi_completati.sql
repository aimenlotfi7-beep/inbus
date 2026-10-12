ALTER TABLE "richieste_rimborso" ADD COLUMN IF NOT EXISTS "completato_il" timestamp;--> statement-breakpoint
-- I rimborsi già approvati prima di questa colonna hanno già restituito
-- credito, coupon e offerta: si segnano come completati, altrimenti il
-- giro giornaliero li rifarebbe e scalerebbe gli usi una seconda volta.
UPDATE "richieste_rimborso" SET "completato_il" = coalesce("gestita_il", "richiesta_il")
WHERE "stato" = 'APPROVATA' AND "completato_il" IS NULL;
