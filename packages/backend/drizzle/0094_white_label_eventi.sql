CREATE TABLE IF NOT EXISTS "white_label_eventi" (
	"white_label_id" text NOT NULL,
	"evento_id" text NOT NULL,
	"aggiunto_il" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "white_label_eventi_white_label_id_evento_id_pk" PRIMARY KEY("white_label_id","evento_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "white_label_eventi" ADD CONSTRAINT "white_label_eventi_white_label_id_white_label_id_fk" FOREIGN KEY ("white_label_id") REFERENCES "public"."white_label"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "white_label_eventi" ADD CONSTRAINT "white_label_eventi_evento_id_eventi_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventi"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "white_label_eventi_evento_idx" ON "white_label_eventi" USING btree ("evento_id");
--> statement-breakpoint
-- Le White Label di prima: il loro evento diventa il primo dell'elenco.
INSERT INTO "white_label_eventi" ("white_label_id", "evento_id", "aggiunto_il")
SELECT "id", "evento_id", "creato_il" FROM "white_label" WHERE "evento_id" IS NOT NULL
ON CONFLICT DO NOTHING;