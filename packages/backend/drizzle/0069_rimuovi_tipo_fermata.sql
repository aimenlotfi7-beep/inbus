ALTER TABLE "fermate" DROP COLUMN IF EXISTS "tipo";--> statement-breakpoint
ALTER TABLE "fermate_percorso_salvato" DROP COLUMN IF EXISTS "tipo";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."tipo_fermata";