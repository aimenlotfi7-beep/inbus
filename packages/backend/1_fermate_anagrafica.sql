-- InBus — anagrafica fermate da Eventinbus (2 eventi)
-- Idempotente: salta le fermate gia' presenti (stessa citta' + stesso indirizzo,
-- confronto senza maiuscole/spazi, stesso criterio della migration 0049).
-- Rilanciarlo piu' volte non crea doppioni.
BEGIN;

INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'z3b68tsulzvrgxvq1xymg4ae', 'Agrate', 'Agrate', 'Via Giacomo Matteotti 142', 45.573, 9.355, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Agrate'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Giacomo Matteotti 142')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'r1yae2a89f6y2wrq0nshsigz', 'Albenga', 'Albenga', 'Via al Piemonte', 44.05, 8.217, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Albenga'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via al Piemonte')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ofb0jq1zqqiyo9ns63ssv2qf', 'Alessandria Ovest', 'Alessandria Ovest', 'Via Casale', 44.936222, 8.584001, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Alessandria Ovest'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Casale')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'gts5d7uyspktyql4z9t7y9pd', 'Ancona Nord', 'Ancona Nord', 'Via M. D''Antona incrocio Via M. Biagi', 43.59807058293782, 13.34945866986243, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Ancona Nord'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via M. D''Antona incrocio Via M. Biagi')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hfv5h4sg7g42yrypk23853by', 'Andria', 'Andria', 'Contrada Barba d''Angelo', 41.23768395113552, 16.295306771586517, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Andria'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Barba d''Angelo')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'e8dxfiboq45rqmqzkuwfoojn', 'Aprilia', 'Aprilia', 'Via P. Mascagni, 103', 41.594, 12.648, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Aprilia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via P. Mascagni, 103')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'r0ny1ttuc2fbx4vtp8lcfree', 'Arezzo', 'Arezzo', 'Loc. Battifolle, 36/b', 43.438573, 11.778062, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Arezzo'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Loc. Battifolle, 36/b')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'q9v5ld4dji1onkrxynrxyk8c', 'Asti', 'Asti', 'Corso Torino, 475', 44.907136, 8.255306, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Asti'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Corso Torino, 475')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'cs0xv4t1voeem3olhza6moqi', 'Avellino', 'Avellino', 'Via Nazionale, Mercogliano Avellino', 40.947685, 14.835657, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Avellino'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Nazionale, Mercogliano Avellino')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'yyrf5w9f87klp1fh53wqu00w', 'Avezzano', 'Avezzano', 'Strada Statale N.5', 42.047025551785985, 13.406420844879001, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Avezzano'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale N.5')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hekazmeqtpglg5hwa8y66gmv', 'Bari', 'Bari', 'Via G. Amendola', 41.116951302126886, 16.868307820176643, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Bari'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via G. Amendola')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'poj885g6he0ue5ncbw2enzce', 'Bassano del Grappa', 'Bassano del Grappa', 'Viale A. De Gasperi, 80/82', 45.739, 11.7288, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Bassano del Grappa'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale A. De Gasperi, 80/82')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'p1hc2qx5725uuivn962n22mm', 'Bastia Umbra', 'Bastia Umbra', 'Piazza Bakunin', 43.067, 12.546, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Bastia Umbra'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Bakunin')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'rpmo12cv1yh12qsp0mm3yhph', 'Battipaglia', 'Battipaglia', 'Rotonda Strada Statale 18', 40.61, 14.984, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Battipaglia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Strada Statale 18')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'qr2i8nq0fna590urvxvettta', 'Benevento (Casello)', 'Benevento', 'Strada Provinciale Passo Castello', 41.069108087986734, 14.917150073361148, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Benevento'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale Passo Castello')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'gtxkc33sc6hi5vndayxzww2y', 'Bergamo', 'Bergamo', 'Via Autostrada', 45.68004218477677, 9.66915933984271, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Bergamo'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Autostrada')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'lxviaepohugamcraw0ef78pl', 'Bologna (Stazione)', 'Bologna', 'Piazza XX Settembre (Stazione Autolinee)', 44.508552, 11.280748, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Bologna'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazza XX Settembre (Stazione Autolinee)')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'mvls2ryadgsj8jpa3o815d7p', 'Brescia (Brescia Centro)', 'Brescia', 'Via Borgosatollo', 45.507958, 10.22803, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Brescia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Borgosatollo')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'aryr923n4fmbnsidrt8kxctk', 'Brindisi (Ospedale)', 'Brindisi', 'Via Appia', 40.633, 17.938, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Brindisi'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Appia')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'll80cgc3qv478b0b87afn83g', 'Busto Arsizio', 'Busto Arsizio', 'Via Busto Fagnano', 45.612, 8.849, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Busto Arsizio'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Busto Fagnano')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ce343cmel3p6grci1foku8es', 'Caianello', 'Caianello', 'Via Ceraselle', 41.313, 14.1, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Caianello'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Ceraselle')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'mjojvk4xqk8n7jwbxonx0vfe', 'Carpi', 'Carpi', 'Entrata casello autostradale', 44.769027, 10.845501, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Carpi'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Entrata casello autostradale')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'wq4zqew4uu15mp9fns0iwccl', 'Caserta Nord', 'Caserta Nord', 'Via Casagiove-Casapulla', 41.075752, 14.302498, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Caserta Nord'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Casagiove-Casapulla')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'z3m9446oxwzzusbobqplrw1n', 'Cassino', 'Cassino', 'Via del Cerro', 41.461184, 13.79852, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Cassino'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via del Cerro')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'mh9pnk4trakeuwse9fn0lcf7', 'Cava de'' Tirreni', 'Cava de'' Tirreni', 'Via XXV Luglio', 40.701, 14.706, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Cava de'' Tirreni'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via XXV Luglio')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'wyj258mm9glk1z9zidoz9vfa', 'Cecina', 'Cecina', 'Via Montanara', 43.307, 10.517, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Cecina'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Montanara')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'vibitr84unt1tcvh5csoei9k', 'Cesena', 'Cesena', 'Via Dino Rondani', 44.1921, 12.2148, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Cesena'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Dino Rondani')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'o37swotfbte9vbelwb6rbhjd', 'Chiavari', 'Chiavari', 'Piazzale della Franca', 44.32129763451438, 9.320738596781558, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Chiavari'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale della Franca')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'akg9y8v3qlv0x5ckaepqlhkz', 'Chieti', 'Chieti', 'Viale Abruzzo, Stadio Angelini', 42.36, 14.16, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Chieti'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale Abruzzo, Stadio Angelini')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'e3zhqfl2ahu87ck3cy6c6i9h', 'Civitanova Marche', 'Civitanova Marche', 'Via Einaudi, 232', 43.293532, 13.708233, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Civitanova Marche'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Einaudi, 232')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'lxnwo1zebkvyey0g4vn8g0xm', 'Como', 'Como', 'Via Cristoforo Colombo', 45.78212, 9.054156, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Como'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Cristoforo Colombo')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'jlg4ihocv2595327hrhlt4bt', 'Conegliano', 'Conegliano', 'Via Fabio Filzi', 45.8807, 12.3086, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Conegliano'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Fabio Filzi')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'fdjlouo4mufvzuq736xk7mok', 'Contursi Terme', 'Contursi Terme', 'Strada Provinciale 65', 40.657, 15.238, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Contursi Terme'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 65')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'npljprcmefilxqah9qv16uyv', 'Cosenza Nord (Rende)', 'Cosenza Nord', 'Via Louis Braille', 39.36, 16.229, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Cosenza Nord'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Louis Braille')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'pq4wdpc3r4u12vxzw1yoztee', 'Desenzano del Garda', 'Desenzano del Garda', 'Strada Statale 567', 45.47, 10.535, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Desenzano del Garda'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale 567')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'n8pjal45hjj5sgviu0ip00sv', 'Eboli', 'Eboli', 'Via San Vito Martire', 40.617, 15.056, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Eboli'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via San Vito Martire')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'tmbcv0cvk9asdgjf7vc2oanb', 'Faenza', 'Faenza', 'Via San Silvestro', 44.286, 11.883, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Faenza'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via San Silvestro')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 's4fvhhts7n60dhekj6yt8bk2', 'Fano', 'Fano', 'Via Luchino Visconti', 43.844, 13.018, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Fano'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Luchino Visconti')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'jxqs78svvhf37x4dq9k6nmdz', 'Ferrara Nord', 'Ferrara Nord', 'Via Giovan Battista Crema', 44.865972, 11.57418, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Ferrara Nord'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Giovan Battista Crema')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hvqwy1r9ml91b02e7m2uo9qo', 'Fidenza', 'Fidenza', 'Via Federico Fellini, 1', 44.886, 10.0888, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Fidenza'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Federico Fellini, 1')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'lfqg1uoasn5gy1l6r4cnm1rm', 'Fiorenzuola', 'Fiorenzuola', 'Via Fiorenzuola', 44.928, 9.908, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Fiorenzuola'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Fiorenzuola')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'yflc1bvpvfc6rv1ylb4y593y', 'Firenze (Aeroporto)', 'Firenze', 'Via del Termine', 43.832286, 11.160215, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Firenze'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via del Termine')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ms273biadi38wqgpcduk41ue', 'Foggia (Candela)', 'Foggia', 'Strada Provinciale 95', 41.496971, 15.564011, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Foggia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 95')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'u9nedx8zx36wipynw46f3k97', 'Foligno', 'Foligno', 'Viale Firenze', 42.955, 12.703, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Foligno'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale Firenze')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 't3rhums32e4iu3hfqi2o9l1k', 'Follonica', 'Follonica', 'Strada Provinciale 152', 42.923521, 10.762846, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Follonica'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 152')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'iefzd15tdujv6n99vn7qp2gi', 'Forli''', 'Forli''', 'Viale della Costituzione 1', 44.25, 12.0878, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Forli'''))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale della Costituzione 1')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'it2off2okbq9hmss686r8iyh', 'Frascineto', 'Frascineto', 'Strada Provinciale 263', 39.84, 16.29, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Frascineto'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 263')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'i2lw4ik7egb2xgcye01tls35', 'Frosinone', 'Frosinone', 'Via dei Monti Lepini', 41.621301, 13.315772, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Frosinone'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Monti Lepini')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 's31d204uifupndgs53kuzfb0', 'Gallarate', 'Gallarate', 'Piazza Buffoni 5', 45.666714, 8.796792, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Gallarate'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Buffoni 5')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'qogu9u9ok4bdxx4miljgmxqz', 'Genova Est', 'Genova Est', 'Via Piacenza', 44.416341, 8.918613, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Genova Est'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Piacenza')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ek6ooq8okmxfai4rfiwkini3', 'Gioia Tauro', 'Gioia Tauro', 'SP1 430', 38.425, 15.899, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Gioia Tauro'))
    AND lower(trim(fa.indirizzo)) = lower(trim('SP1 430')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'bthhdez5g98vie65f07dsa4s', 'Giulianova', 'Giulianova', 'Contrada Rovano 33, Mosciano Sant''Angelo', 42.713225, 13.910968, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Giulianova'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Rovano 33, Mosciano Sant''Angelo')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ccw68kiaj07e8b3617bj60jf', 'Grosseto', 'Grosseto', 'Via Senese, 170', 42.789327, 11.091481, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Grosseto'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Senese, 170')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'jdmixb8b2fdbk5o6lnhoqr5a', 'Grottaglie', 'Grottaglie', 'Largo Unicef', 40.538, 17.434, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Grottaglie'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Largo Unicef')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'f98g4rzyu1nsemx1wam5z2wd', 'Imola', 'Imola', 'Via Selice, 47', 44.3777, 11.7361, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Imola'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Selice, 47')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'u6qjjymmtbovl05rlcx8quxd', 'L''Aquila Ovest', 'L''Aquila Ovest', 'Strada Statale 17, localita'' Sant''Antonio', NULL, NULL, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('L''Aquila Ovest'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale 17, localita'' Sant''Antonio')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'tbkas3rkuwkmwqduc0k3aahv', 'Lagonegro', 'Lagonegro', 'Strada Provinciale 26', 40.125, 15.762, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Lagonegro'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Provinciale 26')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'imd6wkk5flhfut16l9f7pswt', 'Lamezia Est', 'Lamezia Est', 'SS 280 dei Due Mari', 38.93, 16.27, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Lamezia Est'))
    AND lower(trim(fa.indirizzo)) = lower(trim('SS 280 dei Due Mari')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'woo6gtfsy5ubhshlwxccme4e', 'Lanciano', 'Lanciano', 'Contrada Calcagna', 42.26343010754465, 14.431587716677008, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Lanciano'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Contrada Calcagna')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'k2d7318ng6ubwsll2haq28jo', 'Latina (Borgo Piave)', 'Latina', 'Via Piave', 41.467, 12.904, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Latina'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Piave')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'eji291mhb8a87st3ku9qqb8r', 'Lecce', 'Lecce', 'Via della Lira Italiana', 40.352, 18.175, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Lecce'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via della Lira Italiana')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hniba9vaxm9juabg6dgyki5i', 'Livorno', 'Livorno', 'Via Antonio Bacchelli, 60', 43.54799795591633, 10.339074548358763, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Livorno'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Antonio Bacchelli, 60')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'g1p6addj6mt03g791coq80lu', 'Lodi (Pieve Fissiraga)', 'Lodi', 'Via Isola Rota', 45.276224, 9.455764, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Lodi'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Isola Rota')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'sewsu7259fp2dnjgmg1d2vms', 'Lucca', 'Lucca', 'Via Savonarola', 43.831745, 10.49461, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Lucca'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Savonarola')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'o4byannvxfbdgn9flxtvn1nd', 'Mantova Sud', 'Mantova Sud', 'Via Massimo D''Antona', 45.156, 10.791, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Mantova Sud'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Massimo D''Antona')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'pntbp9pttolf4dy4023o83wn', 'Massa', 'Massa', 'Via Massa Avenza, 32', 44.0219, 10.109, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Massa'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Massa Avenza, 32')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'oq06hm8lye5gqgjjrax8ylua', 'Massafra', 'Massafra', 'SS7 Appia 10', 40.59, 17.115, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Massafra'))
    AND lower(trim(fa.indirizzo)) = lower(trim('SS7 Appia 10')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'qdfz1hdq92sow78dqmnbv4gm', 'Mestre', 'Mestre', 'Rotonda Romea', 45.474051, 12.21404, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Mestre'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Romea')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'zot1icindrqandba3e7tvpfq', 'Milano (Lambrate)', 'Milano', 'Via Predil', 45.48516416669662, 9.238597781640134, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Milano'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Predil')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'fck7xup5bs2wkeh37ns04vys', 'Modena (Campogalliano)', 'Modena', 'Uscita Campogalliano', 44.654529364087956, 10.867979174127838, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Modena'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Campogalliano')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'gs4igrrfkgy0vcyg2fhxadak', 'Molfetta', 'Molfetta', 'Via Terlizzi', 41.201, 16.599, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Molfetta'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Terlizzi')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hyw4m9wmyh3u4y64jmt9hh6c', 'Moncalieri', 'Moncalieri', 'Strada Vivero', 45.0, 7.68, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Moncalieri'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Vivero')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'd9wcsmed0j3f5w9tuyhf1qhd', 'Napoli (Stazione)', 'Napoli', 'Via Galileo Ferraris, 40', 40.85194, 14.271363, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Napoli'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Galileo Ferraris, 40')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'f08fb751tmu80dx1ya4e027o', 'Nocera Inferiore', 'Nocera Inferiore', 'Via Giuseppe Atzori', 40.744, 14.642, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Nocera Inferiore'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Giuseppe Atzori')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'kvs3e9vbvlbrm2gauzurw4hp', 'Novara', 'Novara', 'Uscita Novara Ovest - Veveri', 45.4748, 8.56364, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Novara'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Novara Ovest - Veveri')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'z0fpo219a5be6nmy4mvteazj', 'Orte', 'Orte', 'Via Lazio', 42.4554, 12.4091, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Orte'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Lazio')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'd7wg2bfvikoxpdite8v3k0ty', 'Padova', 'Padova', 'Via Po, 197', 45.416571, 11.933705, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Padova'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Po, 197')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'weuttzmlu1v66ffpz002du73', 'Parma', 'Parma', 'Strada Traversante Lupo', 44.828499, 10.198135, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Parma'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Traversante Lupo')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'w9uo1ux1ts5mzludcijwcnke', 'Perugia', 'Perugia', 'Via Alessandro Manzoni', 43.08842064005202, 12.446232409483079, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Perugia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Alessandro Manzoni')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'jk9p654fvph818jo8mw2npea', 'Pesaro', 'Pesaro', 'Strada della Fornace Vecchia', 43.897448, 12.84064, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pesaro'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada della Fornace Vecchia')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'loni883jpk4qv73kh528s4vz', 'Pescara Nord', 'Pescara Nord', 'Viale 22 Maggio 1944', 42.397898, 14.289929, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pescara Nord'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale 22 Maggio 1944')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'tpwgcgk0j169hlvq6ai4ljy7', 'Piacenza Sud', 'Piacenza Sud', 'Viale dell''Agricoltura', 45.0427733467437, 9.75205225154648, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Piacenza Sud'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale dell''Agricoltura')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hcdrgt29keuyvgiwxebija82', 'Piombino', 'Piombino', 'Via Stazione', 43.054, 10.622, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Piombino'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Stazione')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'vu84i5kgd20bg13imi69y52p', 'Pisa (Ikea)', 'Pisa', 'Via Rino Ricci, 8', 43.78156315716349, 10.33624365444584, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pisa'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Rino Ricci, 8')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'xjwyt10434nhdac0eyd21c3m', 'Pistoia', 'Pistoia', 'Raccordo di Pistoia', 43.921235, 10.915518, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pistoia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Raccordo di Pistoia')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'u15nztlwvurk4en1cj60e6we', 'Pomezia', 'Pomezia', 'Via Pontina Vecchia 30', 41.669, 12.501, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pomezia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Pontina Vecchia 30')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'w8wqqv4y5yxsk69tw5bo0je4', 'Pompei Est', 'Pompei Est', 'Via Acqua Salsa', 40.7456, 14.5116, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pompei Est'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Acqua Salsa')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'pzayi6dndug4mhne0m75h9yv', 'Pordenone', 'Pordenone', 'Via Dogana', 45.964, 12.657, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Pordenone'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Dogana')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 't3j4euxkhpcro2z3h667h5y6', 'Potenza', 'Potenza', 'Viale del Basento, 112', 40.642, 15.805, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Potenza'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale del Basento, 112')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'buvmwxie99sglphvq1jcn965', 'Prato', 'Prato', 'Piazzale Falcone e Borsellino', 43.85873103041477, 11.109894604257699, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Prato'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale Falcone e Borsellino')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ohiunerueulgw3edqqphor8f', 'Reggio (Villa San Giovanni)', 'Reggio', 'Viale Italia', NULL, NULL, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Reggio'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale Italia')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'euytkrvoa8fgy5txgdcmoi1r', 'Reggio Emilia', 'Reggio Emilia', 'Via Gaetano Filangieri', 44.725573, 10.630441, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Reggio Emilia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Gaetano Filangieri')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'i2s271s5rbncukfjvpbsslnd', 'Riccione', 'Riccione', 'Via Enrico Berlinguer', 43.98972, 12.643674, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Riccione'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Enrico Berlinguer')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'opp4x8197uz9di35jwok5zo5', 'Rimini', 'Rimini', 'Autostrada Nord', 44.087739, 12.470056, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Rimini'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Autostrada Nord')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ps73wz2xlne7s5ig696qhub9', 'Roma Cinecitta', 'Roma Cinecitta', 'Via Lamaro 12', 41.8521, 12.5734, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Roma Cinecitta'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Lamaro 12')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'kpzuf8276u4ge2661ic3ph9m', 'Rovato', 'Rovato', 'Via Rovato, 44', 45.5798, 10.0022, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Rovato'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Rovato, 44')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'trq5uiqbwn92lkm499i5yh2x', 'Rovigo Nord', 'Rovigo Nord', 'Via Roma 103', 45.11514578702251, 11.773950209513929, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Rovigo Nord'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Roma 103')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'z951my1fdesh8t2uideo7slu', 'Sala Consilina', 'Sala Consilina', 'Terminal Bus', 40.39, 15.595, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Sala Consilina'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Terminal Bus')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'j0m04r6ukyosrt1rmzwr9ki4', 'Salerno (Stazione)', 'Salerno', 'Piazza Concordia', 40.67397, 14.769932, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Salerno'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Concordia')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'lfilufvchzq1f21dqrzlxq3b', 'San Benedetto del Tronto', 'San Benedetto del Tronto', 'Via San Giovanni', 42.8958, 13.8838, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('San Benedetto del Tronto'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via San Giovanni')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'wnf7jiuf895wwd8q57fuxfnf', 'San Dona - Noventa', 'San Dona - Noventa', 'Via Rialto, 1', 45.6679, 12.5358, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('San Dona - Noventa'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Rialto, 1')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'm6yptrupoyqmho7ebx6mv4x1', 'San Severo', 'San Severo', 'SS272', 41.691718, 15.403401, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('San Severo'))
    AND lower(trim(fa.indirizzo)) = lower(trim('SS272')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'n0vnkp253t61kro30r1srrur', 'Santhia', 'Santhia', 'Corso 25 Aprile', 45.3825, 8.14065, 'EIB ASAP Milano'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Santhia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Corso 25 Aprile')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'vyyqwbyctfva34l0ddbxigss', 'Saronno', 'Saronno', 'Viale Europa', 45.6187, 9.01967, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Saronno'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale Europa')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'zf0z3m4u896b3jrcrctzus95', 'Sarzana', 'Sarzana', 'Via Variante Aurelia', 44.106189119662055, 9.95219026073101, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Sarzana'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Variante Aurelia')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'jobniz8jdq00v9bqreiqx55m', 'Savona', 'Savona', 'Via Caravaggio', 44.287225, 8.442428, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Savona'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Caravaggio')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'qtynthitwxkbjhobdg6pxqyr', 'Senigallia', 'Senigallia', 'Strada Statale Arceviese', 43.702323, 13.207999, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Senigallia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale Arceviese')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'qdhthq5dfcxcmr6pk3o14gym', 'Spoleto', 'Spoleto', 'Via Pietro Conti, 1', 42.74, 12.737, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Spoleto'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Pietro Conti, 1')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'uns7wgg0yv9fw8rs6nb7zvqi', 'Sulmona', 'Sulmona', 'Uscita Pratola Peligna', 42.101202480583794, 13.864823712708176, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Sulmona'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Uscita Pratola Peligna')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'qmfp91vrkbsbjupxjighzdw2', 'Taranto', 'Taranto', 'Via Porto Mercantile', 40.464, 17.247, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Taranto'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Porto Mercantile')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'k88u0g5zh468glfsciwso3fm', 'Teramo', 'Teramo', 'Via Po, 90', 42.658, 13.704, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Teramo'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Po, 90')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'vzweovowoh1u8lvbiihj0uje', 'Termoli', 'Termoli', 'Via Corsica 185', 41.981971511674146, 15.006071881282379, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Termoli'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Corsica 185')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hdaq91vuuweazvwm75ki3pi7', 'Terni Ovest', 'Terni Ovest', 'Viale Donato Bramante', 42.714346, 12.148656, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Terni Ovest'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale Donato Bramante')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'owe9yu8vou43t7orlvz2i4t0', 'Thiene', 'Thiene', 'Via dei Quartieri, 169', 45.6947, 11.4974, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Thiene'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via dei Quartieri, 169')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'y6i8v744ascp2467exsvfaae', 'Torino (Porta Nuova)', 'Torino', 'Piazza Carlo Felice', 45.075383, 7.61459, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Torino'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazza Carlo Felice')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'l6igwlv0i8nmv791o7djz93p', 'Treviso (Silea)', 'Treviso', 'Via Caduti di Nassiriya', 45.652547, 12.30771, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Treviso'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Caduti di Nassiriya')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'u6wiqw2avh2j9gd08vrv63ud', 'Udine (Palmanova)', 'Udine', 'Via Julia 30', 45.8873, 13.309, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Udine'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Julia 30')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'jp6seo4jof0yxf7mtaf1wsi1', 'Udine - Stadio', 'Udine - Stadio', 'Viale dello Sport', 46.0815, 13.1976, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Udine - Stadio'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Viale dello Sport')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'orjwq2n4x3l6egyrraus781k', 'Valdichiana (Bettolle)', 'Valdichiana', 'Via Giuseppe Di Vittorio', 43.2093, 11.8029, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Valdichiana'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Giuseppe Di Vittorio')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ppdml0h5hum8ij4ef1rb9atv', 'Valmontone', 'Valmontone', 'Via Artena 54', 41.777, 12.92, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Valmontone'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Artena 54')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'hzzkviryyb8i17s9g38czq85', 'Varese', 'Varese', 'Piazzale Trieste', 45.815642, 8.832696, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Varese'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Piazzale Trieste')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'k8cw9lhf46ytszin3eipqm3m', 'Vasto', 'Vasto', 'Strada Statale 16, Km504', 42.057956, 14.771042, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Vasto'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Strada Statale 16, Km504')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'oy08hterrhxkvacm11tjb65q', 'Venezia (Portogruaro)', 'Venezia', 'Rotonda Alcide de Gasperi', NULL, NULL, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Venezia'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Rotonda Alcide de Gasperi')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'iczixjdpmijwyj68uj5fhynh', 'Verona Sud', 'Verona Sud', 'Via Enrico Fermi 6', 45.41415, 10.853176, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Verona Sud'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Enrico Fermi 6')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'tnes252fbuyj342n9ueour1r', 'Viareggio', 'Viareggio', 'Via Aurelia Nord 342', 43.8987, 10.254257, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Viareggio'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via Aurelia Nord 342')));
INSERT INTO fermate_anagrafica (id, nome, citta, indirizzo, lat, lng, note)
SELECT 'ncdtmqawqbrciudl17usma1k', 'Vicenza Est', 'Vicenza Est', 'Via della Serenissima', 45.517, 11.5998, 'EIB Vasco Roma'
WHERE NOT EXISTS (SELECT 1 FROM fermate_anagrafica fa
  WHERE lower(trim(fa.citta)) = lower(trim('Vicenza Est'))
    AND lower(trim(fa.indirizzo)) = lower(trim('Via della Serenissima')));

COMMIT;

-- verifica
-- SELECT count(*) FROM fermate_anagrafica;
-- SELECT nome, citta FROM fermate_anagrafica WHERE lat IS NULL;