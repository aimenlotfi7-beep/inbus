DO $$ BEGIN
 CREATE TYPE "public"."categoria_evento" AS ENUM('CONCERTI', 'FESTIVAL', 'SPORT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN "categoria" "categoria_evento";