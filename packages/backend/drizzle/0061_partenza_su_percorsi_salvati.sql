ALTER TABLE "fermate_percorso_salvato" ADD COLUMN "tipo" "tipo_fermata" DEFAULT 'PASSAGGIO' NOT NULL;--> statement-breakpoint
ALTER TABLE "fermate_percorso_salvato" ADD COLUMN "soglia_minima" integer;