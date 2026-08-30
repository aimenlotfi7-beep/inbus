-- L'indirizzo e l'orario di arrivo si decidono ora sul tragitto
-- (colonna nuova aggiunta nella migrazione precedente), non piu' su
-- evento/servizio - come richiesto, i vecchi dati vengono svuotati qui
-- (non copiati sul tragitto: l'ammnistratore li reimposta da zero
-- nella scheda di ogni tragitto in Eventi).
--
-- Le colonne restano nella tabella (non le elimino) - solo i dati
-- vengono svuotati. Se in futuro si vuole anche togliere le colonne
-- stesse, va fatto separatamente con una nuova migrazione.

UPDATE "eventi" SET arrivo_indirizzo = NULL, arrivo_orario = NULL;
UPDATE "servizi" SET arrivo_indirizzo = NULL, arrivo_orario = NULL;
