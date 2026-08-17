-- Cancella TUTTI gli eventi, le prenotazioni, la lista d'attesa e i bus
-- censiti, per ripartire puliti. NON tocca: utenti/clienti, tour leader,
-- promoter, coupon, fornitori, amministratori, ruoli, tragitti, contenuti
-- del sito — solo eventi e tutto ciò che è collegato a un evento.
--
-- ATTENZIONE: azione irreversibile. Se ci sono prenotazioni vere di
-- clienti reali (non di prova), verranno cancellate per sempre insieme
-- al resto. Eseguila solo se sei sicuro di voler ripartire da zero.

BEGIN;

DELETE FROM partecipanti_prenotazione;
DELETE FROM prenotazioni;
DELETE FROM lista_attesa;
DELETE FROM bus_tratte;
DELETE FROM bus_fisici;
DELETE FROM eventi; -- cascata automatica: linee_bus, fermate, immagini_evento, allegati_evento, promoter_eventi

COMMIT;
