DO $$ BEGIN
 CREATE TYPE "public"."autore_messaggio" AS ENUM('CLIENTE', 'ADMIN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."metodo_pagamento" AS ENUM('CARTA', 'PAYPAL', 'SATISPAY', 'DA_CONCORDARE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ruolo_admin" AS ENUM('AMMINISTRATORE', 'OPERATORE', 'COLLABORATORE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."stato_lista_attesa" AS ENUM('IN_ATTESA', 'PROMOSSA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."stato_prenotazione" AS ENUM('CONFERMATA', 'CANCELLATA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."stato_tour_leader" AS ENUM('CANDIDATO', 'ATTIVO', 'ARCHIVIATO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tipo_coupon" AS ENUM('PERCENTUALE', 'FISSO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tipo_pagamento" AS ENUM('COMPLETO', 'ACCONTO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "allegati_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"nome" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "amministratori" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"ruolo" "ruolo_admin" DEFAULT 'OPERATORE' NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "amministratori_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categorie" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	CONSTRAINT "categorie_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contenuti_sito" (
	"chiave" text PRIMARY KEY NOT NULL,
	"valore" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"codice" text NOT NULL,
	"tipo" "tipo_coupon" NOT NULL,
	"valore" numeric(10, 2) NOT NULL,
	"usi_max" integer,
	"usi_attuali" integer DEFAULT 0 NOT NULL,
	"valido_dal" timestamp,
	"valido_al" timestamp,
	"attivo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "coupon_codice_unique" UNIQUE("codice")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eventi" (
	"id" text PRIMARY KEY NOT NULL,
	"artista" text NOT NULL,
	"genere" text NOT NULL,
	"luogo" text NOT NULL,
	"citta" text NOT NULL,
	"data" timestamp NOT NULL,
	"prezzo" numeric(10, 2) NOT NULL,
	"in_evidenza" boolean DEFAULT false NOT NULL,
	"ordine_evidenza" integer DEFAULT 0 NOT NULL,
	"vetrina_dal" timestamp,
	"vetrina_al" timestamp,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	"aggiornato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fermate" (
	"id" text PRIMARY KEY NOT NULL,
	"linea_id" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	"citta" text NOT NULL,
	"indirizzo" text NOT NULL,
	"orario" text,
	"orario_ritorno" text,
	"indirizzo_ritorno" text,
	"prezzo" numeric(10, 2),
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fermate_tragitto" (
	"id" text PRIMARY KEY NOT NULL,
	"tragitto_id" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	"citta" text NOT NULL,
	"indirizzo" text NOT NULL,
	"orario" text,
	"prezzo" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fornitori" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"partita_iva" text,
	"referente" text,
	"telefono" text,
	"email" text,
	"indirizzo" text,
	"note" text,
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "immagini_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"url" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "impostazioni" (
	"chiave" text PRIMARY KEY NOT NULL,
	"valore" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linee_bus" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"nome" text NOT NULL,
	"posti_totali" integer NOT NULL,
	"posti_disponibili" integer NOT NULL,
	"prezzo_extra" numeric(10, 2) DEFAULT '0' NOT NULL,
	"referente_nome" text,
	"referente_telefono" text,
	"fornitore_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lista_attesa" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"passeggeri" integer NOT NULL,
	"stato" "stato_lista_attesa" DEFAULT 'IN_ATTESA' NOT NULL,
	"data_creazione" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "log_attivita" (
	"id" text PRIMARY KEY NOT NULL,
	"amministratore_id" text,
	"azione" text NOT NULL,
	"dettaglio" text,
	"data" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messaggi_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"autore" "autore_messaggio" NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"testo" text NOT NULL,
	"letto" boolean DEFAULT false NOT NULL,
	"creato_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pagine_cms" (
	"chiave" text PRIMARY KEY NOT NULL,
	"titolo" text NOT NULL,
	"contenuto" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prenotazioni" (
	"id" text PRIMARY KEY NOT NULL,
	"pnr" text NOT NULL,
	"evento_id" text NOT NULL,
	"linea_id" text NOT NULL,
	"fermata_citta" text NOT NULL,
	"fermata_indirizzo" text,
	"fermata_orario" text,
	"orario_ritorno" text,
	"indirizzo_ritorno" text,
	"referente_nome" text,
	"referente_telefono" text,
	"passeggeri" integer NOT NULL,
	"totale" numeric(10, 2) NOT NULL,
	"sconto" numeric(10, 2) DEFAULT '0' NOT NULL,
	"coupon_codice" text,
	"tipo_pagamento" "tipo_pagamento" DEFAULT 'COMPLETO' NOT NULL,
	"saldo_pagato" boolean DEFAULT true NOT NULL,
	"scadenza_saldo" timestamp,
	"metodo_pagamento" "metodo_pagamento" DEFAULT 'CARTA' NOT NULL,
	"utente_id" text NOT NULL,
	"promoter_codice" text,
	"stato" "stato_prenotazione" DEFAULT 'CONFERMATA' NOT NULL,
	"motivo_cancellazione" text,
	"rimborso_stato" text,
	"rimborso_importo" numeric(10, 2),
	"rimborso_data" timestamp,
	"creata_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prenotazioni_pnr_unique" UNIQUE("pnr")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoter" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"password_hash" text NOT NULL,
	"codice" text NOT NULL,
	"commissione_percentuale" numeric(5, 2) DEFAULT '10' NOT NULL,
	"note" text,
	CONSTRAINT "promoter_email_unique" UNIQUE("email"),
	CONSTRAINT "promoter_codice_unique" UNIQUE("codice")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoter_eventi" (
	"promoter_id" text NOT NULL,
	"evento_id" text NOT NULL,
	CONSTRAINT "promoter_eventi_promoter_id_evento_id_pk" PRIMARY KEY("promoter_id","evento_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tour_leader" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cognome" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"data_nascita" timestamp,
	"citta" text,
	"lingue" text,
	"disponibilita" text,
	"esperienza" text,
	"stato" "stato_tour_leader" DEFAULT 'CANDIDATO' NOT NULL,
	"evento_riferimento" text,
	"note" text,
	"data_candidatura" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tragitti" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "utenti" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text,
	"cognome" text,
	"email" text NOT NULL,
	"telefono" text,
	"codice_fiscale" text,
	"data_nascita" timestamp,
	"indirizzo" text,
	"citta" text,
	"cap" text,
	"note" text,
	"creato_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "utenti_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allegati_evento" ADD CONSTRAINT "allegati_evento_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fermate" ADD CONSTRAINT "fermate_linea_id_linee_bus_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee_bus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fermate_tragitto" ADD CONSTRAINT "fermate_tragitto_tragitto_id_tragitti_id_fk" FOREIGN KEY ("tragitto_id") REFERENCES "public"."tragitti"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "immagini_evento" ADD CONSTRAINT "immagini_evento_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linee_bus" ADD CONSTRAINT "linee_bus_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linee_bus" ADD CONSTRAINT "linee_bus_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lista_attesa" ADD CONSTRAINT "lista_attesa_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "log_attivita" ADD CONSTRAINT "log_attivita_amministratore_id_amministratori_id_fk" FOREIGN KEY ("amministratore_id") REFERENCES "public"."amministratori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messaggi_chat" ADD CONSTRAINT "messaggi_chat_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_linea_id_linee_bus_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."linee_bus"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prenotazioni" ADD CONSTRAINT "prenotazioni_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promoter_eventi" ADD CONSTRAINT "promoter_eventi_promoter_id_promoter_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoter"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promoter_eventi" ADD CONSTRAINT "promoter_eventi_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tour_leader" ADD CONSTRAINT "tour_leader_evento_riferimento_eventi_id_fk" FOREIGN KEY ("evento_riferimento") REFERENCES "public"."eventi"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
