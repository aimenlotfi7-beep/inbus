DO $$ BEGIN
 CREATE TYPE "public"."stato_conversazione" AS ENUM('APERTA', 'IN_CORSO', 'CHIUSA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversazioni_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"cliente_email" text NOT NULL,
	"cliente_nome" text NOT NULL,
	"stato" "stato_conversazione" DEFAULT 'APERTA' NOT NULL,
	"creata_il" timestamp DEFAULT now() NOT NULL,
	"ultimo_messaggio_il" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messaggi_chat" ADD COLUMN IF NOT EXISTS "conversazione_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversazioni_chat" ADD CONSTRAINT "conversazioni_chat_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messaggi_chat" ADD CONSTRAINT "messaggi_chat_conversazione_id_conversazioni_chat_id_fk" FOREIGN KEY ("conversazione_id") REFERENCES "public"."conversazioni_chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
