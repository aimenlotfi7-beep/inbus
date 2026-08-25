CREATE TABLE IF NOT EXISTS "organizzatore_eventi" (
	"organizzatore_id" text NOT NULL,
	"evento_id" text NOT NULL,
	CONSTRAINT "organizzatore_eventi_organizzatore_id_evento_id_pk" PRIMARY KEY("organizzatore_id","evento_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizzatori" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"password_hash" text NOT NULL,
	"note" text,
	"token_reset_password" text,
	"token_reset_password_scadenza" timestamp,
	CONSTRAINT "organizzatori_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "fermate_percorso_salvato" DROP CONSTRAINT "fermate_percorso_salvato_percorso_salvato_id_percorsi_salvati_id_fk";
--> statement-breakpoint
ALTER TABLE "tragitti" DROP CONSTRAINT "tragitti_evento_id_eventi_id_fk";
--> statement-breakpoint
ALTER TABLE "tragitti" DROP CONSTRAINT "tragitti_fornitore_id_fornitori_id_fk";
--> statement-breakpoint
ALTER TABLE "tragitti" DROP CONSTRAINT "tragitti_servizio_id_servizi_id_fk";
--> statement-breakpoint
ALTER TABLE "servizi" DROP CONSTRAINT "servizi_evento_id_eventi_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizzatore_eventi" ADD CONSTRAINT "organizzatore_eventi_organizzatore_id_organizzatori_id_fk" FOREIGN KEY ("organizzatore_id") REFERENCES "public"."organizzatori"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizzatore_eventi" ADD CONSTRAINT "organizzatore_eventi_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fermate_percorso_salvato" ADD CONSTRAINT "fermate_percorso_salvato_percorso_salvato_id_percorsi_salvati_id_fk" FOREIGN KEY ("percorso_salvato_id") REFERENCES "public"."percorsi_salvati"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tragitti" ADD CONSTRAINT "tragitti_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tragitti" ADD CONSTRAINT "tragitti_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tragitti" ADD CONSTRAINT "tragitti_servizio_id_servizi_id_fk" FOREIGN KEY ("servizio_id") REFERENCES "public"."servizi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "servizi" ADD CONSTRAINT "servizi_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
