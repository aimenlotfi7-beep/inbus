-- Ogni servizio ha il proprio indirizzo di arrivo (prima solo
-- l'orario) — non più condiviso con gli altri servizi dello stesso
-- evento, ognuno ha la sua sezione arrivo completa.
ALTER TABLE IF EXISTS "servizi" ADD COLUMN IF NOT EXISTS "arrivo_indirizzo" text;
