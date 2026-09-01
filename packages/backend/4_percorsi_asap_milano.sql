-- InBus — percorsi Eventinbus — ASAP Rocky, Milano 10/09/2026
-- Fonte: eventinbus.com, rilevazione 31/08/2026. Percorsi DICHIARATI dall'agenzia (perc_id).
-- Le fermate si agganciano all'anagrafica per citta'+indirizzo:
-- lanciare PRIMA 1_fermate_anagrafica.sql.
-- Testa 1 = prima fermata (partenza). Testa 2 = arrivo: indirizzo e orario si scrivono in Eventi.
-- Il campo prezzo (= Margine nel gestionale) resta a 0.
BEGIN;
INSERT INTO percorsi_salvati (id, nome) VALUES ('h8gi3klfujakuf9a7oibdd95', 'Ancona Nord → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'zqfk5y2bfxtj3ynr1z0yzwap', 'h8gi3klfujakuf9a7oibdd95', 0, fa.id, 'Ancona Nord', 'Via M. D''Antona incrocio Via M. Biagi', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Ancona Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via M. D''Antona incrocio Via M. Biagi')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'seznkwwb4wkj82tiyc2tgl9b', 'h8gi3klfujakuf9a7oibdd95', 1, fa.id, 'Pesaro', 'Strada della Fornace Vecchia', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pesaro'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada della Fornace Vecchia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jojykenr5jrxnx2aiec8xyig', 'h8gi3klfujakuf9a7oibdd95', 2, fa.id, 'Riccione', 'Via Enrico Berlinguer', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Riccione'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Enrico Berlinguer')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'w6o6ozy0gz5wj8dmugzu2duq', 'h8gi3klfujakuf9a7oibdd95', 3, fa.id, 'Rimini', 'Autostrada Nord', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Rimini'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Autostrada Nord')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'iiprugsqjnbr8dwlntlqvtzd', 'h8gi3klfujakuf9a7oibdd95', 4, fa.id, 'Cesena', 'Via Dino Rondani', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cesena'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Dino Rondani')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'vag9dk3azlw2xyvaerh7mknq', 'h8gi3klfujakuf9a7oibdd95', 5, fa.id, 'Forli''', 'Viale della Costituzione 1', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Forli'''))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale della Costituzione 1')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'eanqpy9io7af1rbg8toe9uhg', 'h8gi3klfujakuf9a7oibdd95', 6, fa.id, 'Imola', 'Via Selice, 47', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Imola'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Selice, 47')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('ljgpfgvne3yjpgjh23vrtex8', 'h8gi3klfujakuf9a7oibdd95', 7, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('cthilax1shxj59m5duwx7udm', 'Bari → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'w37pisbdexc3nsft46gtwxuu', 'cthilax1shxj59m5duwx7udm', 0, fa.id, 'Bari', 'Via G. Amendola', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bari'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via G. Amendola')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'od2jxjgdhdthxiqjwle5440x', 'cthilax1shxj59m5duwx7udm', 1, fa.id, 'Andria', 'Contrada Barba d''Angelo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Andria'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Barba d''Angelo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'mjxk7hw1oerxyokxx87wj7dk', 'cthilax1shxj59m5duwx7udm', 2, fa.id, 'Foggia', 'Strada Provinciale 95', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Foggia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 95')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'b7sbagphn5t07uwlzuhg659p', 'cthilax1shxj59m5duwx7udm', 3, fa.id, 'Termoli', 'Via Corsica 185', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Termoli'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Corsica 185')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'lukgyxz4ut54q68tzk2oopea', 'cthilax1shxj59m5duwx7udm', 4, fa.id, 'Lanciano', 'Contrada Calcagna', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Lanciano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Calcagna')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'x7ega0glvsnovmys6ls6qctz', 'cthilax1shxj59m5duwx7udm', 5, fa.id, 'Pescara Nord', 'Viale 22 Maggio 1944', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pescara Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale 22 Maggio 1944')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'uulog6beiozo5ggkwtdsiukz', 'cthilax1shxj59m5duwx7udm', 6, fa.id, 'Giulianova', 'Contrada Rovano 33, Mosciano Sant''Angelo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Giulianova'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Rovano 33, Mosciano Sant''Angelo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'sgpmc0ys574m4n5a23jycgts', 'cthilax1shxj59m5duwx7udm', 7, fa.id, 'San Benedetto del Tronto', 'Via San Giovanni', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('San Benedetto del Tronto'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via San Giovanni')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'x4diw6ffocmk13tttqqhfi0p', 'cthilax1shxj59m5duwx7udm', 8, fa.id, 'Civitanova Marche', 'Via Einaudi, 232', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Civitanova Marche'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Einaudi, 232')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('z9tclohqlyci0ixjtmdycv97', 'cthilax1shxj59m5duwx7udm', 9, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('i3gt8setkma9hvt3ob6eim1f', 'Salerno → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'v640xu6eyg08ym0s7svaxjl7', 'i3gt8setkma9hvt3ob6eim1f', 0, fa.id, 'Salerno', 'Piazza Concordia', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Salerno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Concordia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'rmkv10te57g8eutpl09rqcd9', 'i3gt8setkma9hvt3ob6eim1f', 1, fa.id, 'Pompei Est', 'Via Acqua Salsa', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pompei Est'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Acqua Salsa')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'hyfoennc59v0g3a7tmi3u87a', 'i3gt8setkma9hvt3ob6eim1f', 2, fa.id, 'Napoli', 'Via Galileo Ferraris, 40', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Napoli'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Galileo Ferraris, 40')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ik4ev3zclailrve74a4qwpes', 'i3gt8setkma9hvt3ob6eim1f', 3, fa.id, 'Caserta Nord', 'Via Casagiove-Casapulla', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Caserta Nord'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Casagiove-Casapulla')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'zzr9sawcv42wbo52v595wxxj', 'i3gt8setkma9hvt3ob6eim1f', 4, fa.id, 'Cassino', 'Via del Cerro', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Cassino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via del Cerro')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'fld5xa5ajtyjzq2efrsvvh6a', 'i3gt8setkma9hvt3ob6eim1f', 5, fa.id, 'Frosinone', 'Via dei Monti Lepini', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Frosinone'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Monti Lepini')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'phn0ml5wgnzfdm884h7ukdr0', 'i3gt8setkma9hvt3ob6eim1f', 6, fa.id, 'Roma Cinecitta', 'Via Lamaro 12', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Roma Cinecitta'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Lamaro 12')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'uve2s19v3x25az6u5ifwzo7o', 'i3gt8setkma9hvt3ob6eim1f', 7, fa.id, 'Orte', 'Via Lazio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Orte'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Lazio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'f3b26i365ioohl1z3vlj9tk8', 'i3gt8setkma9hvt3ob6eim1f', 8, fa.id, 'Valdichiana', 'Via Giuseppe Di Vittorio', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Valdichiana'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Giuseppe Di Vittorio')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'hrqbwrxt6i9u2evw4bt68dn2', 'i3gt8setkma9hvt3ob6eim1f', 9, fa.id, 'Arezzo', 'Loc. Battifolle, 36/b', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Arezzo'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Loc. Battifolle, 36/b')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('lvxm0j19l61s3tcdco3vc5wr', 'i3gt8setkma9hvt3ob6eim1f', 10, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('vokv0664iubeesmj80v88m3j', 'Como → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'esuwricx58fbvvg49ldo6d4a', 'vokv0664iubeesmj80v88m3j', 0, fa.id, 'Como', 'Via Cristoforo Colombo', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Como'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Cristoforo Colombo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'qdyrt5i39dcj4fj4bm5slb80', 'vokv0664iubeesmj80v88m3j', 1, fa.id, 'Saronno', 'Viale Europa', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Saronno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale Europa')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('tyojnz6ox0v8tqyf9gz0ob1m', 'vokv0664iubeesmj80v88m3j', 2, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('vjesdectciyal1n94ktt8i1z', 'Bologna → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'vux8nfp749fqt3m7bf5ogwq8', 'vjesdectciyal1n94ktt8i1z', 0, fa.id, 'Bologna', 'Piazza XX Settembre (Stazione Autolinee)', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bologna'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza XX Settembre (Stazione Autolinee)')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'v5rkss3fr7p8p1tdd5r992dm', 'vjesdectciyal1n94ktt8i1z', 1, fa.id, 'Modena', 'Uscita Campogalliano', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Modena'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Campogalliano')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wbakmsd951dvsu8dav8vo91o', 'vjesdectciyal1n94ktt8i1z', 2, fa.id, 'Reggio Emilia', 'Via Gaetano Filangieri', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Reggio Emilia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Gaetano Filangieri')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ogws2j5vmstyuxxy419p1bq7', 'vjesdectciyal1n94ktt8i1z', 3, fa.id, 'Parma', 'Strada Traversante Lupo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Parma'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Strada Traversante Lupo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'b5u53m1hw5wbwhcsyr53r8y9', 'vjesdectciyal1n94ktt8i1z', 4, fa.id, 'Fidenza', 'Via Federico Fellini, 1', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Fidenza'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Federico Fellini, 1')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'aysstl09znxgwro07bsbqpzc', 'vjesdectciyal1n94ktt8i1z', 5, fa.id, 'Piacenza Sud', 'Viale dell''Agricoltura', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Piacenza Sud'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale dell''Agricoltura')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('sk7qxj8aosp7fy1x7bubx8ml', 'vjesdectciyal1n94ktt8i1z', 6, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('phpkk729vjlawpmx5a4kutzu', 'Udine - Stadio → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'xedhdn77ldmvsrcgor24dkit', 'phpkk729vjlawpmx5a4kutzu', 0, fa.id, 'Udine - Stadio', 'Viale dello Sport', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Udine - Stadio'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale dello Sport')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ahkc7ecsf6aq308ixyimom6f', 'phpkk729vjlawpmx5a4kutzu', 1, fa.id, 'Udine', 'Via Julia 30', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Udine'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Julia 30')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'warjjpmvf5hti03hgiyt1fpi', 'phpkk729vjlawpmx5a4kutzu', 2, fa.id, 'San Dona - Noventa', 'Via Rialto, 1', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('San Dona - Noventa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Rialto, 1')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'k6w9to6muc8x2j703lq8umxp', 'phpkk729vjlawpmx5a4kutzu', 3, fa.id, 'Treviso', 'Via Caduti di Nassiriya', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Treviso'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Caduti di Nassiriya')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ygx0lfh60os1kfo6kdriqtp2', 'phpkk729vjlawpmx5a4kutzu', 4, fa.id, 'Mestre', 'Rotonda Romea', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Mestre'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Romea')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'demz1aqmirt1x0c62vs8behf', 'phpkk729vjlawpmx5a4kutzu', 5, fa.id, 'Padova', 'Via Po, 197', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Padova'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Po, 197')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'djxh0sq80a7g4rm5s48zfgq3', 'phpkk729vjlawpmx5a4kutzu', 6, fa.id, 'Verona Sud', 'Via Enrico Fermi 6', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Verona Sud'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Enrico Fermi 6')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('q797cidxxkh0pn0uyu6p1heh', 'phpkk729vjlawpmx5a4kutzu', 7, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('b8136fb6sp9awu1woj8p34tk', 'Conegliano → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ovir0u0n5jyzdnx8w4drskec', 'b8136fb6sp9awu1woj8p34tk', 0, fa.id, 'Conegliano', 'Via Fabio Filzi', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Conegliano'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Fabio Filzi')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('m43dy69n3toolmqfnzws9q1a', 'b8136fb6sp9awu1woj8p34tk', 1, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('lsy1dknmnvnmrw2xsjifh81c', 'Livorno → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'w72ipbzz5lpn10znk8k6scry', 'lsy1dknmnvnmrw2xsjifh81c', 0, fa.id, 'Livorno', 'Via Antonio Bacchelli, 60', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Livorno'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Antonio Bacchelli, 60')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'c35riql2uj40oh5vp52e4l8r', 'lsy1dknmnvnmrw2xsjifh81c', 1, fa.id, 'Pisa', 'Via Rino Ricci, 8', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pisa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Rino Ricci, 8')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ulqgvlub71c6w9ca2s8mlmxh', 'lsy1dknmnvnmrw2xsjifh81c', 2, fa.id, 'Viareggio', 'Via Aurelia Nord 342', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Viareggio'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Aurelia Nord 342')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'spf56db1nzwbkwzzswc60wls', 'lsy1dknmnvnmrw2xsjifh81c', 3, fa.id, 'Massa', 'Via Massa Avenza, 32', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Massa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Massa Avenza, 32')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'faymq31j6on3vpokflapk2rw', 'lsy1dknmnvnmrw2xsjifh81c', 4, fa.id, 'Sarzana', 'Via Variante Aurelia', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Sarzana'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Variante Aurelia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'wk0t05lcljz0qojwx9zouggl', 'lsy1dknmnvnmrw2xsjifh81c', 5, fa.id, 'Chiavari', 'Piazzale della Franca', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Chiavari'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale della Franca')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'mf144lquonog3go0fgwlstsx', 'lsy1dknmnvnmrw2xsjifh81c', 6, fa.id, 'Genova Est', 'Via Piacenza', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Genova Est'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Piacenza')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('dqllbxj0yery2h7mq16a0kux', 'lsy1dknmnvnmrw2xsjifh81c', 7, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('xqy3yu8fmvkyp2l8i7pdfctk', 'Pistoia → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'd7cfrmbdsz42jcjnj7lgnx6j', 'xqy3yu8fmvkyp2l8i7pdfctk', 0, fa.id, 'Pistoia', 'Raccordo di Pistoia', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Pistoia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Raccordo di Pistoia')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'ydc5tz36s696f8gc8rvrfobf', 'xqy3yu8fmvkyp2l8i7pdfctk', 1, fa.id, 'Prato', 'Piazzale Falcone e Borsellino', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Prato'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale Falcone e Borsellino')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'bc5igse4jppfnhskft8v4cl0', 'xqy3yu8fmvkyp2l8i7pdfctk', 2, fa.id, 'Firenze', 'Via del Termine', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Firenze'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via del Termine')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('l9cn58yiyimy1m1ko44ooskv', 'xqy3yu8fmvkyp2l8i7pdfctk', 3, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('xzbkrgfohcwfccuy5ubbvy7r', 'Torino → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'nd1p00g0tzll3luxduxrmpk6', 'xzbkrgfohcwfccuy5ubbvy7r', 0, fa.id, 'Torino', 'Piazza Carlo Felice', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Torino'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Carlo Felice')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'niokm5cp9e17h98cr69vy5ue', 'xzbkrgfohcwfccuy5ubbvy7r', 2, fa.id, 'Santhia', 'Corso 25 Aprile', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Santhia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Corso 25 Aprile')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'iyahrevcclck2kuccq0ymk0e', 'xzbkrgfohcwfccuy5ubbvy7r', 3, fa.id, 'Novara', 'Uscita Novara Ovest - Veveri', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Novara'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Novara Ovest - Veveri')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('x65ld82fpnuj048ne4uhhkzj', 'xzbkrgfohcwfccuy5ubbvy7r', 4, NULL, 'Milano', NULL, 'PASSAGGIO');
INSERT INTO percorsi_salvati (id, nome) VALUES ('u3s7vudprpirxqe1lpvul3vn', 'Bassano del Grappa → Milano');
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'yuursh7763zixdpq9enkjynd', 'u3s7vudprpirxqe1lpvul3vn', 0, fa.id, 'Bassano del Grappa', 'Viale A. De Gasperi, 80/82', 'PARTENZA'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bassano del Grappa'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Viale A. De Gasperi, 80/82')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jxru8k4cqrvj6t04fnqdprg1', 'u3s7vudprpirxqe1lpvul3vn', 1, fa.id, 'Thiene', 'Via dei Quartieri, 169', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Thiene'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Quartieri, 169')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'z06zdqyxbk1x17dc5v7nepfi', 'u3s7vudprpirxqe1lpvul3vn', 2, fa.id, 'Vicenza Est', 'Via della Serenissima', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Vicenza Est'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via della Serenissima')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'jx06rqn2mgr013mp50yvw11q', 'u3s7vudprpirxqe1lpvul3vn', 3, fa.id, 'Brescia', 'Via Borgosatollo', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Brescia'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Borgosatollo')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'k2ob9ws9tpj7jcczp291zf9g', 'u3s7vudprpirxqe1lpvul3vn', 4, fa.id, 'Rovato', 'Via Rovato, 44', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Rovato'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Rovato, 44')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
SELECT 'r7wwps304ln1uwcmgmyh1902', 'u3s7vudprpirxqe1lpvul3vn', 5, fa.id, 'Bergamo', 'Via Autostrada', 'PASSAGGIO'
FROM fermate_anagrafica fa WHERE lower(trim(fa.citta)) = lower(trim('Bergamo'))
  AND lower(trim(fa.indirizzo)) = lower(trim('Via Autostrada')) LIMIT 1;
INSERT INTO fermate_percorso_salvato (id, percorso_salvato_id, ordine, fermata_anagrafica_id, citta, indirizzo, tipo)
VALUES ('sghjepdori2newf00mvg8t4r', 'u3s7vudprpirxqe1lpvul3vn', 6, NULL, 'Milano', NULL, 'PASSAGGIO');
COMMIT;
-- verifica:
-- SELECT p.nome, count(*) FROM percorsi_salvati p JOIN fermate_percorso_salvato f
--   ON f.percorso_salvato_id = p.id WHERE p.nome LIKE '[EIB]%' GROUP BY p.nome ORDER BY p.nome;
-- per annullare:
-- DELETE FROM percorsi_salvati WHERE nome LIKE '[EIB]%';
