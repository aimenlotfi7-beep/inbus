-- L'ordine dei tragitti di un evento: prima non c'era e il database li
-- restituiva come capitava (cambiava dopo ogni modifica). Quelli che esistono
-- già prendono l'ordine in cui il gestionale li mostra adesso; da qui in poi
-- vale l'ordine della scheda evento. Nessun altro dato viene toccato.
ALTER TABLE "tragitti" ADD COLUMN IF NOT EXISTS "ordine" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "tragitti" AS t SET "ordine" = n."posizione"
FROM (SELECT "id", (row_number() OVER (PARTITION BY "evento_id" ORDER BY ctid) - 1)::integer AS "posizione" FROM "tragitti") AS n
WHERE t."id" = n."id";
