CREATE INDEX IF NOT EXISTS "bus_fisici_linea_idx" ON "bus_fisici" USING btree ("linea_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fermate_tragitto_idx" ON "fermate" USING btree ("tragitto_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linee_tragitto_idx" ON "linee" USING btree ("tragitto_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prenotazioni_tragitto_idx" ON "prenotazioni" USING btree ("tragitto_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prenotazioni_evento_idx" ON "prenotazioni" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prenotazioni_stato_idx" ON "prenotazioni" USING btree ("stato");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prenotazioni_utente_idx" ON "prenotazioni" USING btree ("utente_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prenotazioni_fermata_citta_idx" ON "prenotazioni" USING btree ("tragitto_id","fermata_citta");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tragitti_evento_idx" ON "tragitti" USING btree ("evento_id");