ALTER TABLE "prenotazioni" ADD COLUMN "compenso_promoter" jsonb;--> statement-breakpoint
-- Le vendite già fatte con un promoter: si fissa la regola di oggi (quella
-- che i report usano adesso), così da qui in poi non cambiano più. Un codice
-- che non corrisponde a nessun promoter resta senza regola (nessuna
-- commissione, come prima). Prima la percentuale del promoter...
UPDATE "prenotazioni" AS p SET "compenso_promoter" = jsonb_build_object(
  'percentuale', pr."commissione_percentuale"::float8,
  'compensoTipo', null,
  'compensoValore', null,
  'compensoFissoPer', null
)
FROM "promoter" AS pr
WHERE pr."codice" = p."promoter_codice";--> statement-breakpoint
-- ...poi il compenso del coupon usato, se ne ha uno.
UPDATE "prenotazioni" AS p SET "compenso_promoter" = p."compenso_promoter" || jsonb_build_object(
  'compensoTipo', c."compenso_tipo",
  'compensoValore', c."compenso_valore"::float8,
  'compensoFissoPer', c."compenso_fisso_per"
)
FROM "coupon" AS c
WHERE c."codice" = p."coupon_codice" AND p."compenso_promoter" IS NOT NULL;
