ALTER TABLE "coupon" ADD COLUMN "utente_id" text;--> statement-breakpoint
ALTER TABLE "coupon" ADD COLUMN "inviato_il" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon" ADD CONSTRAINT "coupon_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
