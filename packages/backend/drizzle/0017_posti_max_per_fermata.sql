ALTER TABLE "fermate" ADD COLUMN IF NOT EXISTS "posti_max" integer;--> statement-breakpoint
ALTER TABLE "fermate" ADD COLUMN IF NOT EXISTS "posti_prenotati" integer DEFAULT 0 NOT NULL;