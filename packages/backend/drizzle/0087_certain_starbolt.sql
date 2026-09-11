ALTER TABLE "eventi" ADD COLUMN "vendite_fermate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "linee" ADD COLUMN "da_confermare" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Le vendite non si fermano più per i posti dei bus: i tragitti in vendita tornano "quasi illimitati" (999999), i posti già venduti restano tali.
UPDATE "tragitti" SET "posti_disponibili" = GREATEST(0, 999999 - ("posti_totali" - "posti_disponibili")), "posti_totali" = 999999 WHERE "stato" IN ('PREZZATO', 'CONFERMATO') AND "posti_totali" <> 999999;