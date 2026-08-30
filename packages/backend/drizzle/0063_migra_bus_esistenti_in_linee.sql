-- Migrazione dati: i bus gia' registrati (col vecchio sistema, senza
-- passare da un contenitore Linea) vengono "avvolti" in una Linea
-- automatica ciascuno - un bus per Linea, esattamente come si
-- comportavano prima. Nessun dato perso: fermate coperte e
-- assegnazione bus restano identiche, solo ora passano dal nuovo
-- contenitore invece che essere scritte direttamente sul bus.
--
-- gen_random_uuid() invece di generare l'id in JavaScript (come fa
-- normalmente l'app) - nativo in Postgres 13+, nessuna estensione
-- richiesta - va benissimo per queste righe storiche, l'app non fa
-- differenza tra un id generato cosi' o dal solito generatore.

CREATE TEMP TABLE tmp_bus_linea AS
SELECT
  bf.bus_id,
  gen_random_uuid()::text AS nuova_linea_id,
  (
    SELECT f.tragitto_id FROM "bus_fermate" bf2
    JOIN "fermate" f ON f.id = bf2.fermata_id
    WHERE bf2.bus_id = bf.bus_id
    ORDER BY f.ordine LIMIT 1
  ) AS tragitto_id
FROM (SELECT DISTINCT bus_id FROM "bus_fermate") bf
JOIN "bus_fisici" b ON b.id = bf.bus_id
WHERE b.linea_id IS NULL;

-- Numerazione "Linea 1", "Linea 2"... per tragitto, non globale.
INSERT INTO "linee" (id, tragitto_id, nome, ordine)
SELECT
  nuova_linea_id,
  tragitto_id,
  'Linea ' || row_number() OVER (PARTITION BY tragitto_id ORDER BY bus_id),
  0
FROM tmp_bus_linea;

INSERT INTO "linea_fermate" (linea_id, fermata_id, ordine)
SELECT t.nuova_linea_id, bf.fermata_id, COALESCE(f.ordine, 0)
FROM "bus_fermate" bf
JOIN tmp_bus_linea t ON t.bus_id = bf.bus_id
JOIN "fermate" f ON f.id = bf.fermata_id;

UPDATE "bus_fisici" b
SET linea_id = t.nuova_linea_id
FROM tmp_bus_linea t
WHERE b.id = t.bus_id;

DROP TABLE tmp_bus_linea;
