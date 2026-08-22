DO $$ BEGIN
 CREATE TYPE "public"."stato_richiesta_rimborso" AS ENUM('IN_ATTESA', 'APPROVATA', 'RIFIUTATA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "richieste_rimborso" (
	"id" text PRIMARY KEY NOT NULL,
	"prenotazione_id" text NOT NULL,
	"motivo" text,
	"stato" "stato_richiesta_rimborso" DEFAULT 'IN_ATTESA' NOT NULL,
	"note_admin" text,
	"richiesta_il" timestamp DEFAULT now() NOT NULL,
	"gestita_il" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "richieste_rimborso" ADD CONSTRAINT "richieste_rimborso_prenotazione_id_prenotazioni_id_fk" FOREIGN KEY ("prenotazione_id") REFERENCES "public"."prenotazioni"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
