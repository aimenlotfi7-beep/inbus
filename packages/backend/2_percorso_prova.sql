-- InBus — UN SOLO percorso di prova, da Eventinbus
-- [EIB] ASAP Milano 74940 — Emilia (Bologna→Piacenza)
-- Le fermate si agganciano all'anagrafica per citta'+indirizzo:
-- lanciare PRIMA 1_fermate_anagrafica.sql.
-- Testa 1 = prima fermata (partenza). Testa 2 = arrivo, indirizzo e orario si scrivono in Eventi.
-- Il campo prezzo (= Margine nel gestionale) resta a 0.
BEGIN;

INSERT INTO percorsi_salvati (id, nome) VALUES ('fvrcswifhzu65bxlvmlarex5', '[EIB] ASAP Milano 74940 — Emilia (Bologna→Piacenza)');

INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
SELECT 'cz6q6mjoacashiw8zb6zxv3q', 'fvrcswifhzu65bxlvmlarex5', 0, fa.id, 'Bologna', 'Piazza XX Settembre (Stazione Autolinee)', '09:30', 0, 'PARTENZA'
FROM fermate_anagrafica fa
WHERE lower(trim(fa.citta)) = lower(trim('Bologna'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza XX Settembre (Stazione Autolinee)'))
LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
SELECT 'ridhh596uonyng0uwtq4rr4e', 'fvrcswifhzu65bxlvmlarex5', 1, fa.id, 'Modena', 'Uscita Campogalliano', '10:15', 0, 'PASSAGGIO'
FROM fermate_anagrafica fa
WHERE lower(trim(fa.citta)) = lower(trim('Modena'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Campogalliano'))
LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
SELECT 'q5adxq3jw5wi58teulpjq8l2', 'fvrcswifhzu65bxlvmlarex5', 2, fa.id, 'Reggio Emilia', 'Via Gaetano Filangieri', '10:30', 0, 'PASSAGGIO'
FROM fermate_anagrafica fa
WHERE lower(trim(fa.citta)) = lower(trim('Reggio Emilia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Gaetano Filangieri'))
LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
SELECT 'onwx87ohcywhia4ll0bn5ylc', 'fvrcswifhzu65bxlvmlarex5', 3, fa.id, 'Parma', 'Strada Traversante Lupo', '10:50', 0, 'PASSAGGIO'
FROM fermate_anagrafica fa
WHERE lower(trim(fa.citta)) = lower(trim('Parma'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Traversante Lupo'))
LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
SELECT 'g4e6jc163aeiemvxnm5veu2r', 'fvrcswifhzu65bxlvmlarex5', 4, fa.id, 'Fidenza', 'Via Federico Fellini, 1', '11:15', 0, 'PASSAGGIO'
FROM fermate_anagrafica fa
WHERE lower(trim(fa.citta)) = lower(trim('Fidenza'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Federico Fellini, 1'))
LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
SELECT 'esohhf3ra3qjg72z6t8hny25', 'fvrcswifhzu65bxlvmlarex5', 5, fa.id, 'Piacenza Sud', 'Viale dell''Agricoltura', '11:45', 0, 'PASSAGGIO'
FROM fermate_anagrafica fa
WHERE lower(trim(fa.citta)) = lower(trim('Piacenza Sud'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale dell''Agricoltura'))
LIMIT 1;
-- Testa 2: l'ARRIVO. Non collegata all'anagrafica: indirizzo e orario
-- si compilano in Eventi quando il percorso viene applicato.
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, orario, prezzo, tipo)
VALUES ('lywjzlzxjdnnw12lnsa64yof', 'fvrcswifhzu65bxlvmlarex5', 6, NULL, 'Milano', NULL, NULL, 0, 'PASSAGGIO');

COMMIT;

-- verifica
-- SELECT p.nome, f.ordine, f.citta, f.orario, f.tipo, f.fermata_anagrafica_id IS NOT NULL AS collegata
-- FROM percorsi_salvati p JOIN fermate_percorso_salvato f ON f.percorso_salvato_id = p.id
-- WHERE p.id = 'fvrcswifhzu65bxlvmlarex5' ORDER BY f.ordine;

-- per annullare:
-- DELETE FROM percorsi_salvati WHERE id = 'fvrcswifhzu65bxlvmlarex5';