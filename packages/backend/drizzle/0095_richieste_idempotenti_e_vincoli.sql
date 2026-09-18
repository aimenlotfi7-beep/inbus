CREATE TABLE IF NOT EXISTS "richieste_idempotenti" (
	"ambito" text NOT NULL,
	"chiave" text NOT NULL,
	"risposta" jsonb,
	"creata_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "richieste_idempotenti_ambito_chiave_pk" PRIMARY KEY("ambito","chiave")
);
--> statement-breakpoint
ALTER TABLE "fermate" ADD COLUMN "spenta_per_soglia_il" timestamp;
--> statement-breakpoint
-- Controllo della logica (settembre 2026): contatori e importi mai sotto
-- zero, garantito anche dal database e non solo dal codice. NOT VALID: i
-- dati già salvati non si ricontrollano (la migrazione non si ferma per un
-- vecchio valore), ma ogni scrittura nuova deve rispettarli.
DO $$ BEGIN
 ALTER TABLE "utenti" ADD CONSTRAINT "utenti_credito_non_negativo" CHECK ("credito_disponibile" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon" ADD CONSTRAINT "coupon_usi_non_negativi" CHECK ("usi_attuali" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offerte_evento" ADD CONSTRAINT "offerte_utilizzi_non_negativi" CHECK ("utilizzi" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fermate" ADD CONSTRAINT "fermate_posti_prenotati_non_negativi" CHECK ("posti_prenotati" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tragitti" ADD CONSTRAINT "tragitti_posti_disponibili_non_negativi" CHECK ("posti_disponibili" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_passeggeri_positivi" CHECK ("passeggeri" > 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_importi_non_negativi" CHECK ("totale" >= 0 AND "sconto" >= 0 AND "credito_usato" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;