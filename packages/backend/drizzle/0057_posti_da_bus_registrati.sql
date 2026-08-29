-- I posti totali di un tragitto non si scrivono piu' a mano - si
-- ricalcolano dalla somma dei bus VERI registrati (vedi
-- ricalcolaPostiTragitto nel codice, chiamata ogni volta che l'elenco
-- bus di un tragitto cambia). Questa migrazione allinea SUBITO tutti i
-- tragitti gia' esistenti al valore vero, invece di lasciarli con il
-- vecchio numero scritto a mano finche' qualcuno non tocca di nuovo un
-- loro bus (che li farebbe ricalcolare da soli comunque, ma non
-- subito).
--
-- I posti gia' occupati (venduti) restano tali - solo i disponibili si
-- aggiustano di conseguenza, stessa logica gia' usata per ogni altro
-- aggiustamento manuale dei posti.
--
-- Tragitti senza nemmeno un bus registrato non vengono toccati (la SUM
-- del JOIN semplicemente non li include) - sono comunque "Da
-- confermare", non in vendita, il loro numero attuale non ha effetti
-- pratici finche' restano cosi'.

UPDATE "tragitti" t SET
  "posti_disponibili" = GREATEST(0, bus_sum.totale - (t."posti_totali" - t."posti_disponibili")),
  "posti_totali" = bus_sum.totale
FROM (
  SELECT bt."tragitto_id" AS tragitto_id, SUM(COALESCE(bf."posti_bus", 0)) AS totale
  FROM "bus_tratte" bt
  JOIN "bus_fisici" bf ON bf."id" = bt."bus_id"
  GROUP BY bt."tragitto_id"
) bus_sum
WHERE bus_sum.tragitto_id = t."id";
