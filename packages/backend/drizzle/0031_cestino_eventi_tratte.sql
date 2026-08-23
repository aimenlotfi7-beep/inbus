ALTER TABLE "eventi" ADD COLUMN IF NOT EXISTS "eliminato_il" timestamp;--> statement-breakpoint
ALTER TABLE "linee_bus" ADD COLUMN IF NOT EXISTS "eliminato_il" timestamp;