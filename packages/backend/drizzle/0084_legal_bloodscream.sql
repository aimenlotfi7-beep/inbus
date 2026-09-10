ALTER TABLE "utenti" ADD COLUMN "codice_referral" text;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN "invitato_da_utente_id" text;--> statement-breakpoint
ALTER TABLE "utenti" ADD COLUMN "bonus_referral_invitante_erogato" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "utenti" ADD CONSTRAINT "utenti_invitato_da_utente_id_utenti_id_fk" FOREIGN KEY ("invitato_da_utente_id") REFERENCES "public"."utenti"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "utenti" ADD CONSTRAINT "utenti_codice_referral_unique" UNIQUE("codice_referral");