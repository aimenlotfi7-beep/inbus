-- InBus — percorsi Eventinbus — Vasco Rossi, Roma 06/06/2027
-- Fonte: eventinbus.com, rilevazione 31/08/2026. Percorsi DICHIARATI dall'agenzia (perc_id).
-- Le fermate si agganciano all'anagrafica per citta'+indirizzo:
-- lanciare PRIMA 1_fermate_anagrafica.sql.
-- Testa 1 = prima fermata (partenza). Testa 2 = arrivo: indirizzo e orario si scrivono in Eventi.
-- Il campo prezzo (= Margine nel gestionale) resta a 0.
BEGIN;
INSERT INTO percorsi_salvati (id, nome) VALUES ('f5aujq99diauag7g0lffucif', 'Lecce → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'j64a88d8iuiqqicuz064egw6', 'f5aujq99diauag7g0lffucif', 0, fa.id, 'Lecce', 'Via della Lira Italiana', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lecce'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via della Lira Italiana')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'te32iyovzms6qb9x5cvjizce', 'f5aujq99diauag7g0lffucif', 1, fa.id, 'Brindisi', 'Via Appia', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Brindisi'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Appia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'zkkglk8rlkdy06xcemw6nwfd', 'f5aujq99diauag7g0lffucif', 2, fa.id, 'Grottaglie', 'Largo Unicef', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Grottaglie'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Largo Unicef')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ap9n6l9wllbgmag1scof91ti', 'f5aujq99diauag7g0lffucif', 3, fa.id, 'Taranto', 'Via Porto Mercantile', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Taranto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Porto Mercantile')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'm1xhu4kkijstlwgkcaew8fmp', 'f5aujq99diauag7g0lffucif', 4, fa.id, 'Massafra', 'SS7 Appia 10', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Massafra'))
  AND lower(trim(fa.indirizzo)) = lower(trim('SS7 Appia 10')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ggnydei6gsh60dby0walurxu', 'f5aujq99diauag7g0lffucif', 5, fa.id, 'Bari', 'Via G. Amendola', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bari'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via G. Amendola')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'shr598l3fnzaultdu66g9ewo', 'f5aujq99diauag7g0lffucif', 7, fa.id, 'Andria', 'Contrada Barba d''Angelo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Andria'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Barba d''Angelo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wpgw5bz36u8wah6f46zmtw4w', 'f5aujq99diauag7g0lffucif', 8, fa.id, 'Foggia', 'Strada Provinciale 95', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Foggia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 95')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('sjixyudg61ojfrn6ho5083j6', 'f5aujq99diauag7g0lffucif', 9, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('sf86zyd10xusbvvgzch63eij', 'Como → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ul3nfze97wnd4fyd5e7rzzqw', 'sf86zyd10xusbvvgzch63eij', 0, fa.id, 'Como', 'Via Cristoforo Colombo', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Como'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Cristoforo Colombo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xx9ycm0353ln4xt81jo25wfs', 'sf86zyd10xusbvvgzch63eij', 1, fa.id, 'Saronno', 'Viale Europa', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Saronno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Europa')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ei7r67inkrsdn2t3jvvaj47h', 'sf86zyd10xusbvvgzch63eij', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('ooeob38fjfphr3ehtopeh5u8', 'Torino → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ag3udmfbkjjnyqwamhdld3w6', 'ooeob38fjfphr3ehtopeh5u8', 0, fa.id, 'Torino', 'Piazza Carlo Felice', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Torino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Carlo Felice')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'v3bew4fmfihm2zj1xa1kkcdl', 'ooeob38fjfphr3ehtopeh5u8', 1, fa.id, 'Moncalieri', 'Strada Vivero', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Moncalieri'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Vivero')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'azoh7awsvhroi3dpu9vx8cae', 'ooeob38fjfphr3ehtopeh5u8', 2, fa.id, 'Asti', 'Corso Torino, 475', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Asti'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Corso Torino, 475')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ah191gx5q3nhgxwz9u2dcajo', 'ooeob38fjfphr3ehtopeh5u8', 3, fa.id, 'Alessandria Ovest', 'Via Casale', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Alessandria Ovest'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Casale')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ss871pp6tsv0iwc2ahdrox06', 'ooeob38fjfphr3ehtopeh5u8', 4, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('pa6dulo0q3ybh243lz6if01d', 'Lecce → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'chbn14608qjgoz81ytd0mdvc', 'pa6dulo0q3ybh243lz6if01d', 0, fa.id, 'Lecce', 'Via della Lira Italiana', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lecce'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via della Lira Italiana')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'cnloyalsl6ymg80on86fi05x', 'pa6dulo0q3ybh243lz6if01d', 1, fa.id, 'Brindisi', 'Via Appia', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Brindisi'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Appia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'viblx6lxaljabmndnzuaj9bc', 'pa6dulo0q3ybh243lz6if01d', 2, fa.id, 'Grottaglie', 'Largo Unicef', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Grottaglie'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Largo Unicef')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'mvhnuhkbd3k18vux9d2p0zqp', 'pa6dulo0q3ybh243lz6if01d', 3, fa.id, 'Taranto', 'Via Porto Mercantile', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Taranto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Porto Mercantile')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'nf17pfzgd5km51s34may3bwh', 'pa6dulo0q3ybh243lz6if01d', 4, fa.id, 'Massafra', 'SS7 Appia 10', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Massafra'))
  AND lower(trim(fa.indirizzo)) = lower(trim('SS7 Appia 10')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('b9q1mk9f1w01g2s3pvx0b5yd', 'pa6dulo0q3ybh243lz6if01d', 5, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('nqprv18m7yp8jafyvtttubrn', 'Varese → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ifzhma1a27ilfyrch9ofhyfb', 'nqprv18m7yp8jafyvtttubrn', 0, fa.id, 'Varese', 'Piazzale Trieste', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Varese'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale Trieste')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'c89a5o78cubjmj5fytqmtx7n', 'nqprv18m7yp8jafyvtttubrn', 1, fa.id, 'Gallarate', 'Piazza Buffoni 5', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Gallarate'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Buffoni 5')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'uk0kuyoz4xympc07yi72rw7l', 'nqprv18m7yp8jafyvtttubrn', 2, fa.id, 'Busto Arsizio', 'Via Busto Fagnano', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Busto Arsizio'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Busto Fagnano')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('m0fla853w7qog5a4sk8b08yw', 'nqprv18m7yp8jafyvtttubrn', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('ntdo2jo5nggj6xv003i5fqme', 'Reggio → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'r3kmnra66qof4hiy3ld100az', 'ntdo2jo5nggj6xv003i5fqme', 0, fa.id, 'Reggio', 'Viale Italia', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Reggio'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Italia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'dwnpdgtdncqopiafxbnzm5iv', 'ntdo2jo5nggj6xv003i5fqme', 1, fa.id, 'Gioia Tauro', 'SP1 430', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Gioia Tauro'))
  AND lower(trim(fa.indirizzo)) = lower(trim('SP1 430')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'fy4mmmsh0f493ho6dpkgonbt', 'ntdo2jo5nggj6xv003i5fqme', 2, fa.id, 'Lamezia Est', 'SS 280 dei Due Mari', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lamezia Est'))
  AND lower(trim(fa.indirizzo)) = lower(trim('SS 280 dei Due Mari')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ta5526jh1nshyvxu5t2f9y67', 'ntdo2jo5nggj6xv003i5fqme', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('glvlcg0z91jd3uj7pokl0w0v', 'Bassano del Grappa → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wnnjffivpccvdunciosmzsdm', 'glvlcg0z91jd3uj7pokl0w0v', 0, fa.id, 'Bassano del Grappa', 'Viale A. De Gasperi, 80/82', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bassano del Grappa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale A. De Gasperi, 80/82')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'o93l89u158v7qvtmgxerngkw', 'glvlcg0z91jd3uj7pokl0w0v', 1, fa.id, 'Thiene', 'Via dei Quartieri, 169', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Thiene'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Quartieri, 169')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'pa3kkw3pu7fql8dr465tuo94', 'glvlcg0z91jd3uj7pokl0w0v', 2, fa.id, 'Vicenza Est', 'Via della Serenissima', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Vicenza Est'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via della Serenissima')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('k8s8l7vd67mozlvjnazffcro', 'glvlcg0z91jd3uj7pokl0w0v', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('kxnlajj2l9ctqlue5izqbx0g', 'Albenga → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ibw4zyxnfedgato2c2jef5by', 'kxnlajj2l9ctqlue5izqbx0g', 0, fa.id, 'Albenga', 'Via al Piemonte', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Albenga'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via al Piemonte')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xem7jfjx67de12cwqkh4eeqb', 'kxnlajj2l9ctqlue5izqbx0g', 1, fa.id, 'Savona', 'Via Caravaggio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Savona'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Caravaggio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('cb7fxmrxh8m9opg1dz7yedze', 'kxnlajj2l9ctqlue5izqbx0g', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('am94reh9ceijq49ucelt22mq', 'Brescia → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'qq0m14efkdwfx8ogtkape4sy', 'am94reh9ceijq49ucelt22mq', 0, fa.id, 'Brescia', 'Via Borgosatollo', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Brescia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Borgosatollo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'kitm2qs6dd158ehufcn6ou4r', 'am94reh9ceijq49ucelt22mq', 1, fa.id, 'Desenzano del Garda', 'Strada Statale 567', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Desenzano del Garda'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale 567')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'cgtjep89fe85ckfgi006y75n', 'am94reh9ceijq49ucelt22mq', 2, fa.id, 'Verona Sud', 'Via Enrico Fermi 6', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Verona Sud'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Enrico Fermi 6')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'w9880nk5hhisjaz7ya0vsva5', 'am94reh9ceijq49ucelt22mq', 3, fa.id, 'Mantova Sud', 'Via Massimo D''Antona', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Mantova Sud'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Massimo D''Antona')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bxd4cwqa54r3yiq827v960al', 'am94reh9ceijq49ucelt22mq', 4, fa.id, 'Carpi', 'Entrata casello autostradale', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Carpi'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Entrata casello autostradale')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('vekceth60a6kv9nkce5elkr7', 'am94reh9ceijq49ucelt22mq', 5, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('z2gzme9cz4lzlqg02edy8ukm', 'Pordenone → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'qieiqsc0g2etnxln22xkm63d', 'z2gzme9cz4lzlqg02edy8ukm', 0, fa.id, 'Pordenone', 'Via Dogana', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pordenone'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Dogana')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'f9utpy48z3zljokwh2grt3ux', 'z2gzme9cz4lzlqg02edy8ukm', 1, fa.id, 'Conegliano', 'Via Fabio Filzi', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Conegliano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Fabio Filzi')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('r4wa17h8s4uigibf5uxl98z4', 'z2gzme9cz4lzlqg02edy8ukm', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('h56ljz4ftfrgq7f2dqoq9pr0', 'Udine - Stadio → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xk3qcskraoijgj0s2suoj9i7', 'h56ljz4ftfrgq7f2dqoq9pr0', 0, fa.id, 'Udine - Stadio', 'Viale dello Sport', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Udine - Stadio'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale dello Sport')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xss4d2uq2c7pn8y8tbvnb8iv', 'h56ljz4ftfrgq7f2dqoq9pr0', 1, fa.id, 'Udine', 'Via Julia 30', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Udine'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Julia 30')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'zey7i7h5omb97lhttq7xaaqr', 'h56ljz4ftfrgq7f2dqoq9pr0', 2, fa.id, 'Venezia', 'Rotonda Alcide de Gasperi', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Venezia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Alcide de Gasperi')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ya07cjukpxk3pzn7ewvu3kb9', 'h56ljz4ftfrgq7f2dqoq9pr0', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('ytzpx9sdrqkdby2pq4tcllal', 'Cosenza Nord → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xzan8jrvs1309uw57hsqsz80', 'ytzpx9sdrqkdby2pq4tcllal', 0, fa.id, 'Cosenza Nord', 'Via Louis Braille', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cosenza Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Louis Braille')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'iby7oij1vw9w6wonbirf6khq', 'ytzpx9sdrqkdby2pq4tcllal', 1, fa.id, 'Frascineto', 'Strada Provinciale 263', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Frascineto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 263')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bfb8ii7cqa2ui5rqjn1e1ho0', 'ytzpx9sdrqkdby2pq4tcllal', 2, fa.id, 'Lagonegro', 'Strada Provinciale 26', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lagonegro'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 26')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'fgch9bfzjwemrpj4kjh24uoc', 'ytzpx9sdrqkdby2pq4tcllal', 3, fa.id, 'Sala Consilina', 'Terminal Bus', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Sala Consilina'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Terminal Bus')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('bhtm47745ggngivel6ifp4ie', 'ytzpx9sdrqkdby2pq4tcllal', 4, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('ycx7t2jeihpj8yub17zqyjua', 'Treviso → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'uznyjj0rxu81zsciuuds2xd0', 'ycx7t2jeihpj8yub17zqyjua', 0, fa.id, 'Treviso', 'Via Caduti di Nassiriya', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Treviso'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Caduti di Nassiriya')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'q95e1e8dsqlyqqxxq2gvyytw', 'ycx7t2jeihpj8yub17zqyjua', 1, fa.id, 'Mestre', 'Rotonda Romea', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Mestre'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Romea')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'u62rjs7rcn2io1iubbesl1tu', 'ycx7t2jeihpj8yub17zqyjua', 2, fa.id, 'Padova', 'Via Po, 197', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Padova'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Po, 197')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'm2f1pfqcoz5pff84attsd7a8', 'ycx7t2jeihpj8yub17zqyjua', 3, fa.id, 'Rovigo Nord', 'Via Roma 103', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Rovigo Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Roma 103')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'scf1hlfi6aiaefhs9otgyfrp', 'ycx7t2jeihpj8yub17zqyjua', 4, fa.id, 'Ferrara Nord', 'Via Giovan Battista Crema', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Ferrara Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Giovan Battista Crema')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ntjlwibtemtfnlwlq5kcenkc', 'ycx7t2jeihpj8yub17zqyjua', 5, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('n09k5rlf6t446kjcjpt6ou5t', 'Bergamo → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'pqduwtr5ulusa4gdpwwc950y', 'n09k5rlf6t446kjcjpt6ou5t', 0, fa.id, 'Bergamo', 'Via Autostrada', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bergamo'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Autostrada')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'oq7rz0iynxg8okvcfsd6osup', 'n09k5rlf6t446kjcjpt6ou5t', 1, fa.id, 'Agrate', 'Via Giacomo Matteotti 142', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Agrate'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Giacomo Matteotti 142')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wf7qbsc93l8x6u16l7gz6z6j', 'n09k5rlf6t446kjcjpt6ou5t', 2, fa.id, 'Milano', 'Via Predil', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Milano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Predil')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'joyx53v7myd6t13459r157bc', 'n09k5rlf6t446kjcjpt6ou5t', 4, fa.id, 'Lodi', 'Via Isola Rota', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lodi'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Isola Rota')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ou4417eylayjewh1ulk04nom', 'n09k5rlf6t446kjcjpt6ou5t', 5, fa.id, 'Piacenza Sud', 'Viale dell''Agricoltura', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Piacenza Sud'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale dell''Agricoltura')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'i2mfijvq1il2kbeglof0ywfq', 'n09k5rlf6t446kjcjpt6ou5t', 6, fa.id, 'Fiorenzuola', 'Via Fiorenzuola', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Fiorenzuola'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Fiorenzuola')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('gx2k9zdgtecciica3pnex9lj', 'n09k5rlf6t446kjcjpt6ou5t', 7, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('yt56ie8fxjjf3n98pdht3yst', 'Genova Est → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'rqfbt7i96vqtoi61pmmtjz7j', 'yt56ie8fxjjf3n98pdht3yst', 0, fa.id, 'Genova Est', 'Via Piacenza', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Genova Est'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Piacenza')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'e8fq69xh5s4qcsbihtuf5sdg', 'yt56ie8fxjjf3n98pdht3yst', 2, fa.id, 'Chiavari', 'Piazzale della Franca', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Chiavari'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale della Franca')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('twebfzsv1xqfml3dbzttspmp', 'yt56ie8fxjjf3n98pdht3yst', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('v688pb1xn2n6ei6vbp72v84j', 'Sarzana → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'lm35ezwt8rari8x3rm3x6jvb', 'v688pb1xn2n6ei6vbp72v84j', 0, fa.id, 'Sarzana', 'Via Variante Aurelia', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Sarzana'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Variante Aurelia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ziatl2hiwjdsmztum64pcdhp', 'v688pb1xn2n6ei6vbp72v84j', 1, fa.id, 'Massa', 'Via Massa Avenza, 32', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Massa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Massa Avenza, 32')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('zylrbjwfr38jgqoczslbzsmi', 'v688pb1xn2n6ei6vbp72v84j', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('mi4o002kyncv8icfzbyj5p6q', 'Bari → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ibh66xne9shfmztf9clvqhib', 'mi4o002kyncv8icfzbyj5p6q', 0, fa.id, 'Bari', 'Via G. Amendola', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bari'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via G. Amendola')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'pg70vwlmtp6jdfckaup56wmf', 'mi4o002kyncv8icfzbyj5p6q', 1, fa.id, 'Molfetta', 'Via Terlizzi', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Molfetta'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Terlizzi')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'q6gr8md01j3ab84cq8j3l7vh', 'mi4o002kyncv8icfzbyj5p6q', 2, fa.id, 'Andria', 'Contrada Barba d''Angelo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Andria'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Barba d''Angelo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ivu0c2oaey9ol4uknt4ennp7', 'mi4o002kyncv8icfzbyj5p6q', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('xqxy4c7d3samzbwrvckcgwx6', 'Viareggio → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'do2knxy0bxyemunrec5g1bsc', 'xqxy4c7d3samzbwrvckcgwx6', 0, fa.id, 'Viareggio', 'Via Aurelia Nord 342', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Viareggio'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Aurelia Nord 342')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'lkjlhyhbsq57px9psunslzlg', 'xqxy4c7d3samzbwrvckcgwx6', 1, fa.id, 'Lucca', 'Via Savonarola', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lucca'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Savonarola')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('vmptbk0ddfl8pyegtbnd1i3c', 'xqxy4c7d3samzbwrvckcgwx6', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('qs2w9bu065xuxhvoyjuv0jvu', 'Potenza → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wemeed1nwetseqnmjj2flv2o', 'qs2w9bu065xuxhvoyjuv0jvu', 0, fa.id, 'Potenza', 'Viale del Basento, 112', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Potenza'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale del Basento, 112')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('dgwrf4jgwf0kfg4ymcqwqd5y', 'qs2w9bu065xuxhvoyjuv0jvu', 1, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('utwyizi6829tq99oho3mm7ow', 'Pisa → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'yo8fwdwl4hbrtv628bxct2uy', 'utwyizi6829tq99oho3mm7ow', 0, fa.id, 'Pisa', 'Via Rino Ricci, 8', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pisa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Rino Ricci, 8')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'q5gmj0g7qe33uq0evfxmjlon', 'utwyizi6829tq99oho3mm7ow', 1, fa.id, 'Livorno', 'Via Antonio Bacchelli, 60', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Livorno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Antonio Bacchelli, 60')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bgfck9snw552m6ti477nfjz4', 'utwyizi6829tq99oho3mm7ow', 2, fa.id, 'Cecina', 'Via Montanara', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cecina'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Montanara')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bxcxtrp1xu07z5ivk0aqem56', 'utwyizi6829tq99oho3mm7ow', 3, fa.id, 'Piombino', 'Via Stazione', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Piombino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Stazione')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'f7vvlhhks9qu6a5swy1lv98f', 'utwyizi6829tq99oho3mm7ow', 4, fa.id, 'Follonica', 'Strada Provinciale 152', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Follonica'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 152')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'u0ticf1j6azdmnu66rho2m4n', 'utwyizi6829tq99oho3mm7ow', 5, fa.id, 'Grosseto', 'Via Senese, 170', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Grosseto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Senese, 170')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('zfwp2pxy521iu8xbpgmscc3e', 'utwyizi6829tq99oho3mm7ow', 6, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('b5k8odbtv5r4etvsu1ylrp4t', 'Imola → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'pawty1uu88pkkd4rss4ql2ph', 'b5k8odbtv5r4etvsu1ylrp4t', 0, fa.id, 'Imola', 'Via Selice, 47', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Imola'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Selice, 47')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'gwcc2hi0n0l28n38ddfsajmq', 'b5k8odbtv5r4etvsu1ylrp4t', 1, fa.id, 'Faenza', 'Via San Silvestro', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Faenza'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via San Silvestro')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'shtdkgqgsg68uxqsrrx7ewcq', 'b5k8odbtv5r4etvsu1ylrp4t', 2, fa.id, 'Forli''', 'Viale della Costituzione 1', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Forli'''))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale della Costituzione 1')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'qifnhi8fcuqi3mwr3exdlrif', 'b5k8odbtv5r4etvsu1ylrp4t', 3, fa.id, 'Cesena', 'Via Dino Rondani', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cesena'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Dino Rondani')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('m6rlquiruhkmmobwuttrkejc', 'b5k8odbtv5r4etvsu1ylrp4t', 4, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('c57amxzdzjlxj3n7b9o4cio9', 'Parma → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'cobxoskjfqqvczod3qbqt0pb', 'c57amxzdzjlxj3n7b9o4cio9', 0, fa.id, 'Parma', 'Strada Traversante Lupo', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Parma'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Traversante Lupo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bhtr69acomosp45uqv3w7867', 'c57amxzdzjlxj3n7b9o4cio9', 1, fa.id, 'Reggio Emilia', 'Via Gaetano Filangieri', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Reggio Emilia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Gaetano Filangieri')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'zydora3yks7736v6os9wth6z', 'c57amxzdzjlxj3n7b9o4cio9', 2, fa.id, 'Modena', 'Uscita Campogalliano', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Modena'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Campogalliano')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('lx9u8kh9pxpt5sa40j7qvjoo', 'c57amxzdzjlxj3n7b9o4cio9', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('u9rv62zaoau0lbyev68q40ro', 'Rimini → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'mdxhtlqxy215svb7rcyyt0cq', 'u9rv62zaoau0lbyev68q40ro', 0, fa.id, 'Rimini', 'Autostrada Nord', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Rimini'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Autostrada Nord')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'l9zhw4775dcv37crf0r5va07', 'u9rv62zaoau0lbyev68q40ro', 1, fa.id, 'Riccione', 'Via Enrico Berlinguer', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Riccione'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Enrico Berlinguer')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'nxhakh6wedybkov2fgvr4luo', 'u9rv62zaoau0lbyev68q40ro', 2, fa.id, 'Pesaro', 'Strada della Fornace Vecchia', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pesaro'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada della Fornace Vecchia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'pcgkm8q1g3wng4a9yhg5xxa3', 'u9rv62zaoau0lbyev68q40ro', 3, fa.id, 'Fano', 'Via Luchino Visconti', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Fano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Luchino Visconti')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jb2au2s9p709ivuomffc4mpo', 'u9rv62zaoau0lbyev68q40ro', 4, fa.id, 'Senigallia', 'Strada Statale Arceviese', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Senigallia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale Arceviese')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('fzvp37xlsw4t6y5rlc5btxr4', 'u9rv62zaoau0lbyev68q40ro', 5, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('k5mkpl4kq2y5xv22th1bg186', 'Foggia → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'qebtx3uyn2w2a9lu2mqr2xzs', 'k5mkpl4kq2y5xv22th1bg186', 0, fa.id, 'Foggia', 'Strada Provinciale 95', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Foggia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 95')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'vx885x1aspc4j5ggesxafigj', 'k5mkpl4kq2y5xv22th1bg186', 1, fa.id, 'San Severo', 'SS272', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('San Severo'))
  AND lower(trim(fa.indirizzo)) = lower(trim('SS272')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'epkpk1dy61jqzdv6o1800jwd', 'k5mkpl4kq2y5xv22th1bg186', 2, fa.id, 'Termoli', 'Via Corsica 185', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Termoli'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Corsica 185')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'l3mk0bzvu6dl13vn4hqipkzz', 'k5mkpl4kq2y5xv22th1bg186', 3, fa.id, 'Vasto', 'Strada Statale 16, Km504', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Vasto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale 16, Km504')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'g3yvo57ntvgcs0ub19bvs666', 'k5mkpl4kq2y5xv22th1bg186', 4, fa.id, 'Lanciano', 'Contrada Calcagna', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lanciano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Calcagna')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('qblenxkd52alak1nx54fb2sm', 'k5mkpl4kq2y5xv22th1bg186', 5, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('fvvpvmxk12u89s63lmwte95l', 'Bologna → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'n0fkiygxfnu6f7y3b59ijgjj', 'fvvpvmxk12u89s63lmwte95l', 0, fa.id, 'Bologna', 'Piazza XX Settembre (Stazione Autolinee)', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bologna'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza XX Settembre (Stazione Autolinee)')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ylwk1xrlb4hejnhjxpl5iov0', 'fvvpvmxk12u89s63lmwte95l', 1, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('bsfyydn6io7ms36uufb92beh', 'Ancona Nord → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'nwxsy1sg8kp8twbwnpk06vwl', 'bsfyydn6io7ms36uufb92beh', 0, fa.id, 'Ancona Nord', 'Via M. D''Antona incrocio Via M. Biagi', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Ancona Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via M. D''Antona incrocio Via M. Biagi')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wmz6asnvhqx1h3i1wi7k1207', 'bsfyydn6io7ms36uufb92beh', 2, fa.id, 'Civitanova Marche', 'Via Einaudi, 232', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Civitanova Marche'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Einaudi, 232')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('jtfi4s4inml6xt6tkubpg03q', 'bsfyydn6io7ms36uufb92beh', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('ktd1reo4gq3mbg7digp6dogk', 'Pistoia → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'eatrn88y7xyq3mht5rvcc84k', 'ktd1reo4gq3mbg7digp6dogk', 0, fa.id, 'Pistoia', 'Raccordo di Pistoia', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pistoia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Raccordo di Pistoia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'f7ydfinrwpgwk1jo8u7xnhp4', 'ktd1reo4gq3mbg7digp6dogk', 1, fa.id, 'Prato', 'Piazzale Falcone e Borsellino', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Prato'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale Falcone e Borsellino')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'vru2kfznjuriqyfvq3unyioo', 'ktd1reo4gq3mbg7digp6dogk', 2, fa.id, 'Firenze', 'Via del Termine', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Firenze'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via del Termine')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('r4tt3ka2nop5gym8mdncugfn', 'ktd1reo4gq3mbg7digp6dogk', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('jufy91z2jpgzyk75l3uk7rr6', 'Contursi Terme → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'pm3gzlmgilchq9f884cofv77', 'jufy91z2jpgzyk75l3uk7rr6', 0, fa.id, 'Contursi Terme', 'Strada Provinciale 65', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Contursi Terme'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 65')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bpexhagbfyyawtjjbablmbmr', 'jufy91z2jpgzyk75l3uk7rr6', 1, fa.id, 'Eboli', 'Via San Vito Martire', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Eboli'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via San Vito Martire')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'kr7hsqay000oqdtu5cxy4apy', 'jufy91z2jpgzyk75l3uk7rr6', 2, fa.id, 'Battipaglia', 'Rotonda Strada Statale 18', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Battipaglia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Strada Statale 18')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'iiwv1l6x9t0mp0zor488q6nj', 'jufy91z2jpgzyk75l3uk7rr6', 3, fa.id, 'Salerno', 'Piazza Concordia', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Salerno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Concordia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'hob2def8jtdldkahc7779s92', 'jufy91z2jpgzyk75l3uk7rr6', 4, fa.id, 'Cava de'' Tirreni', 'Via XXV Luglio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cava de'' Tirreni'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via XXV Luglio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'la8u1h3nxu4e8yjmwjvjgxer', 'jufy91z2jpgzyk75l3uk7rr6', 5, fa.id, 'Nocera Inferiore', 'Via Giuseppe Atzori', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Nocera Inferiore'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Giuseppe Atzori')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('e8egxequkc6wnhmh3qkb4fmc', 'jufy91z2jpgzyk75l3uk7rr6', 6, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('gs0ptskkygl7ixl5zub4cj76', 'San Benedetto del Tronto → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jzdb4bfd6iidwc93p69z91s5', 'gs0ptskkygl7ixl5zub4cj76', 0, fa.id, 'San Benedetto del Tronto', 'Via San Giovanni', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('San Benedetto del Tronto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via San Giovanni')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'khv6wdffdow08la1odsfxqth', 'gs0ptskkygl7ixl5zub4cj76', 1, fa.id, 'Giulianova', 'Contrada Rovano 33, Mosciano Sant''Angelo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Giulianova'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Rovano 33, Mosciano Sant''Angelo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('k7irurmojfhukyqxys1bzr3i', 'gs0ptskkygl7ixl5zub4cj76', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('at8br1tbozwxd1gszaqeto6j', 'Firenze → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bk7tpnfhyn1x2q8c3xq5xn2j', 'at8br1tbozwxd1gszaqeto6j', 0, fa.id, 'Firenze', 'Via del Termine', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Firenze'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via del Termine')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ru1llm2hperezmiqo8zmbmet', 'at8br1tbozwxd1gszaqeto6j', 1, fa.id, 'Arezzo', 'Loc. Battifolle, 36/b', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Arezzo'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Loc. Battifolle, 36/b')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'gqou1jct5q0ecjctn8mixe00', 'at8br1tbozwxd1gszaqeto6j', 2, fa.id, 'Valdichiana', 'Via Giuseppe Di Vittorio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Valdichiana'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Giuseppe Di Vittorio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('vcv1v6uv8kbrwttz1vdw2zur', 'at8br1tbozwxd1gszaqeto6j', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('oe5pshyssa4h82pk2xn6q89q', 'Perugia → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'k880hf333cq95on8uts4vw9v', 'oe5pshyssa4h82pk2xn6q89q', 0, fa.id, 'Perugia', 'Via Alessandro Manzoni', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Perugia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Alessandro Manzoni')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jilu3h0p6tfff3rny17gjl77', 'oe5pshyssa4h82pk2xn6q89q', 1, fa.id, 'Bastia Umbra', 'Piazza Bakunin', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bastia Umbra'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Bakunin')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'm2cx5d5ru67pvtttpx93fy9d', 'oe5pshyssa4h82pk2xn6q89q', 2, fa.id, 'Foligno', 'Viale Firenze', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Foligno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Firenze')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'nhoahn4s1omo0rbfb2dwwc1r', 'oe5pshyssa4h82pk2xn6q89q', 3, fa.id, 'Spoleto', 'Via Pietro Conti, 1', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Spoleto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Pietro Conti, 1')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'atz64j8z3ltdr9zlz0f2wmhe', 'oe5pshyssa4h82pk2xn6q89q', 4, fa.id, 'Terni Ovest', 'Viale Donato Bramante', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Terni Ovest'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Donato Bramante')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'j9ah3xv2x86ma8w0qvgqxn4x', 'oe5pshyssa4h82pk2xn6q89q', 5, fa.id, 'Orte', 'Via Lazio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Orte'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Lazio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('hdpoq9qkf00s7uh5rh3e54tc', 'oe5pshyssa4h82pk2xn6q89q', 6, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('x60grcrhgfbx8pt41jm6l70v', 'Pescara Nord → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'srdmlznzq96wwi8xnrncls21', 'x60grcrhgfbx8pt41jm6l70v', 0, fa.id, 'Pescara Nord', 'Viale 22 Maggio 1944', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pescara Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale 22 Maggio 1944')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ccs8fe0p26l0034eyj7pvwsj', 'x60grcrhgfbx8pt41jm6l70v', 1, fa.id, 'Chieti', 'Viale Abruzzo, Stadio Angelini', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Chieti'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Abruzzo, Stadio Angelini')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ebvrrdu9lluk8xww4mp9j4h3', 'x60grcrhgfbx8pt41jm6l70v', 2, fa.id, 'Sulmona', 'Uscita Pratola Peligna', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Sulmona'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Pratola Peligna')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ct7siccji4yigzc1jf1jtsua', 'x60grcrhgfbx8pt41jm6l70v', 3, fa.id, 'Avezzano', 'Strada Statale N.5', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Avezzano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale N.5')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('i9ts7r419rzqo2ovzscsv4be', 'x60grcrhgfbx8pt41jm6l70v', 4, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('minnu2n0m9u2zceyvlx5448a', 'Benevento → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'gug9ax9mkk3k9jxortvldpv0', 'minnu2n0m9u2zceyvlx5448a', 0, fa.id, 'Benevento', 'Strada Provinciale Passo Castello', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Benevento'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale Passo Castello')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'hv3xuhwv0tsx9woukzxw2oe1', 'minnu2n0m9u2zceyvlx5448a', 1, fa.id, 'Avellino', 'Via Nazionale, Mercogliano Avellino', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Avellino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Nazionale, Mercogliano Avellino')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('h8ee98ogukqczg0cjsws0ewg', 'minnu2n0m9u2zceyvlx5448a', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('pau1jg17jigkgstjvrmkndfs', 'Napoli → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jzwvpwobjv6t1jz7zs99yhrd', 'pau1jg17jigkgstjvrmkndfs', 0, fa.id, 'Napoli', 'Via Galileo Ferraris, 40', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Napoli'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Galileo Ferraris, 40')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'fp38tdifsku32kjuysotth23', 'pau1jg17jigkgstjvrmkndfs', 1, fa.id, 'Caserta Nord', 'Via Casagiove-Casapulla', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Caserta Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Casagiove-Casapulla')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 't470fsg47kfkikhvl1692hpm', 'pau1jg17jigkgstjvrmkndfs', 2, fa.id, 'Caianello', 'Via Ceraselle', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Caianello'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Ceraselle')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'lbq1niipj746dbxxd7xrb28b', 'pau1jg17jigkgstjvrmkndfs', 3, fa.id, 'Cassino', 'Via del Cerro', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cassino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via del Cerro')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ckpvr4i90afwn58qpahp083x', 'pau1jg17jigkgstjvrmkndfs', 4, fa.id, 'Frosinone', 'Via dei Monti Lepini', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Frosinone'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Monti Lepini')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('nfwnws77qz8tfzetsp68qqsu', 'pau1jg17jigkgstjvrmkndfs', 5, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('gnz1041y5fp6dy7qqwbwlr8f', 'Teramo → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'zywkh5hdwr0qlap08bl1mn3v', 'gnz1041y5fp6dy7qqwbwlr8f', 0, fa.id, 'Teramo', 'Via Po, 90', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Teramo'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Po, 90')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'p73lpi4mnw25hasjl4l2fc85', 'gnz1041y5fp6dy7qqwbwlr8f', 1, fa.id, 'L''Aquila Ovest', 'Strada Statale 17, localita'' Sant''Antonio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('L''Aquila Ovest'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale 17, localita'' Sant''Antonio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('xava3ff1rervekv7zo408xrx', 'gnz1041y5fp6dy7qqwbwlr8f', 2, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('vkwz9efq06h7ookj2jojnld6', 'Pescara Nord → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'fbgxs9quapa2zz4vs5yqve8q', 'vkwz9efq06h7ookj2jojnld6', 0, fa.id, 'Pescara Nord', 'Viale 22 Maggio 1944', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pescara Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale 22 Maggio 1944')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bj23l30f741jub06tob6lbkf', 'vkwz9efq06h7ookj2jojnld6', 1, fa.id, 'Chieti', 'Viale Abruzzo, Stadio Angelini', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Chieti'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Abruzzo, Stadio Angelini')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'tqlybq76y8yvcx65vy72zmbv', 'vkwz9efq06h7ookj2jojnld6', 2, fa.id, 'Sulmona', 'Uscita Pratola Peligna', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Sulmona'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Pratola Peligna')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xegorff026shz4hhjeliav0o', 'vkwz9efq06h7ookj2jojnld6', 3, fa.id, 'Avezzano', 'Strada Statale N.5', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Avezzano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale N.5')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('buzrgqthrgje61jpbp3puqeh', 'vkwz9efq06h7ookj2jojnld6', 4, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('utwgmk8st9up5jln40pv7c7y', 'Latina → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'fnr5gu3xpebi5ngbfmviyvea', 'utwgmk8st9up5jln40pv7c7y', 0, fa.id, 'Latina', 'Via Piave', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Latina'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Piave')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'uvhjeobp3ft9686jwdhwgjma', 'utwgmk8st9up5jln40pv7c7y', 1, fa.id, 'Aprilia', 'Via P. Mascagni, 103', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Aprilia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via P. Mascagni, 103')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'i9he6vnnkkoxl1wybgx2s9y7', 'utwgmk8st9up5jln40pv7c7y', 2, fa.id, 'Pomezia', 'Via Pontina Vecchia 30', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pomezia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Pontina Vecchia 30')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('leiubi2p9oxu0ah8bj3nyiwa', 'utwgmk8st9up5jln40pv7c7y', 3, NULL, 'Roma', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('uwe87ig6d6t3m3zu8a8gtp5v', 'Napoli → Roma');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'huil414vy9nyio1yloufykmp', 'uwe87ig6d6t3m3zu8a8gtp5v', 0, fa.id, 'Napoli', 'Via Galileo Ferraris, 40', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Napoli'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Galileo Ferraris, 40')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'sct8ozsi2cz7qcdv099afmh0', 'uwe87ig6d6t3m3zu8a8gtp5v', 1, fa.id, 'Caserta Nord', 'Via Casagiove-Casapulla', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Caserta Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Casagiove-Casapulla')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'k6s1h7lt7tby62klg7e7ul7n', 'uwe87ig6d6t3m3zu8a8gtp5v', 2, fa.id, 'Caianello', 'Via Ceraselle', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Caianello'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Ceraselle')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 's3athe0wfkbb0vyfb66nvkq9', 'uwe87ig6d6t3m3zu8a8gtp5v', 3, fa.id, 'Cassino', 'Via del Cerro', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cassino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via del Cerro')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'byymbrj8s9u9sjc6cjqxdbr6', 'uwe87ig6d6t3m3zu8a8gtp5v', 4, fa.id, 'Frosinone', 'Via dei Monti Lepini', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Frosinone'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Monti Lepini')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'nt8zj9hlavdbgbnraraqx2wm', 'uwe87ig6d6t3m3zu8a8gtp5v', 5, fa.id, 'Valmontone', 'Via Artena 54', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Valmontone'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Artena 54')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('wgvde905743y4q2v12xekrqk', 'uwe87ig6d6t3m3zu8a8gtp5v', 6, NULL, 'Roma', NULL, 'PASSAGGIO');
COMMIT;
-- verifica:
-- SELECT p.nome, count(*) FROM percorsi_salvati p JOIN fermate_percorso_salvato f
--   ON f.percorso_salvato_id = p.id WHERE p.nome LIKE '[EIB]%' GROUP BY p.nome ORDER BY p.nome;
-- per annullare:
-- DELETE FROM percorsi_salvati WHERE nome LIKE '[EIB]%';
