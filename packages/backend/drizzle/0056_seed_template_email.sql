-- Nessun modello email era mai stato creato per queste 6 chiavi (la
-- migrazione 0022 aveva creato solo la STRUTTURA della tabella, non le
-- righe) - il codice si aspetta di trovarle, e se manca la riga
-- l'invio fallisce del tutto (segnalato per "reset_password", ma lo
-- stesso vale per qualunque altra chiave qui sotto ancora mai creata).
-- ON CONFLICT DO NOTHING: se una chiave esiste gia' (creata a mano in
-- precedenza), questa migrazione non la tocca - non deve mai
-- sovrascrivere una personalizzazione gia' fatta dall'admin.

INSERT INTO "template_email" ("chiave", "nome", "oggetto", "corpo") VALUES
('reset_password', 'Reimposta password', 'Reimposta la tua password', '<p>Ciao {{nome}},</p><p>Hai chiesto di reimpostare la password del tuo account. Clicca qui sotto per sceglierne una nuova:</p><p><a href="{{link}}">{{link}}</a></p><p>Il link resta valido per {{ore_validita}} ore. Se non sei stato tu a richiederlo, ignora pure questa email — la password resta quella di sempre.</p>'),
('verifica_email', 'Verifica email', 'Conferma il tuo indirizzo email', '<p>Ciao {{nome}},</p><p>Grazie per esserti registrato — conferma il tuo indirizzo email cliccando qui sotto:</p><p><a href="{{link}}">{{link}}</a></p><p>Il link resta valido per {{ore_validita}} ore.</p>'),
('conferma_acconto', 'Conferma prenotazione (acconto)', 'Prenotazione confermata — PNR {{pnr}}', '<p>Ciao {{nome}},</p><p>La tua prenotazione per <strong>{{evento}}</strong> è confermata.</p><p>PNR: <strong>{{pnr}}</strong><br>Fermata: {{fermata}}, ore {{orario}}<br>Passeggeri: {{passeggeri}}<br>Totale: {{totale}} €</p><p>Puoi saldare il resto quando vuoi da qui: <a href="{{link_saldo}}">{{link_saldo}}</a></p>'),
('promemoria_saldo', 'Promemoria saldo', 'Ricordati di saldare la tua prenotazione', '<p>Ciao {{nome}},</p><p>Ti ricordiamo che manca il saldo per <strong>{{evento}}</strong> (PNR {{pnr}}) — restano {{differenza}} € da pagare.</p><p>Puoi saldare da qui: <a href="{{link}}">{{link}}</a></p>'),
('ticket', 'Biglietto', 'Il tuo biglietto — {{evento}}', '<p>Ecco il tuo biglietto per <strong>{{evento}}</strong> (PNR {{pnr}}), in allegato a questa email.</p>'),
('lista_attesa_promossa', 'Promozione da lista d''attesa', 'Si è liberato un posto — {{evento}}', '<p>Ciao {{nome}},</p><p>Buone notizie — si è liberato un posto per <strong>{{evento}}</strong>, ed eri il primo in lista d''attesa!</p><p>Completa la prenotazione da qui: <a href="{{link}}">{{link}}</a></p>')
ON CONFLICT ("chiave") DO NOTHING;
