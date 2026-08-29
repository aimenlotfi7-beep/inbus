ALTER TABLE "eventi" ADD COLUMN "arrivo_indirizzo" text;--> statement-breakpoint
ALTER TABLE "eventi" ADD COLUMN "arrivo_orario" text;--> statement-breakpoint
-- Le stesse colonne erano state aggiunte per errore su linee_bus nella
-- migrazione precedente (0010): l'arrivo è unico per evento, non per
-- tratta, quindi le spostiamo qui e le togliamo da lì. Il DROP è
-- "IF EXISTS" per non fallire su un database dove 0010 non fosse mai
-- stata applicata.
ALTER TABLE "linee_bus" DROP COLUMN IF EXISTS "arrivo_indirizzo";--> statement-breakpoint
ALTER TABLE "linee_bus" DROP COLUMN IF EXISTS "arrivo_orario";