ALTER TABLE "fermate_percorso_salvato" ALTER COLUMN "indirizzo" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "percorsi_salvati" ADD COLUMN "arrivo_citta" text;--> statement-breakpoint
ALTER TABLE "tragitti" ADD COLUMN "arrivo_citta" text;