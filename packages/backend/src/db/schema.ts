// =====================================================================
// INBUS — Schema del database (Drizzle ORM / PostgreSQL)
// Copre TUTTE le entità della Versione 18. I moduli "core" (Eventi,
// Linee/Fermate, Prenotazioni, Utenti, Auth) sono implementati fino in
// fondo nel backend (vedi src/modules). Gli altri modelli sono pronti
// per essere collegati a API seguendo lo stesso schema — vedi
// /docs/MODULI-DA-COMPLETARE.md
// =====================================================================

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  pgEnum,
  primaryKey,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

const id = () => text('id').primaryKey().$defaultFn(() => createId());

// ---------------------------------------------------------------------
// ENUM
// ---------------------------------------------------------------------
export const statoPrenotazioneEnum = pgEnum('stato_prenotazione', ['CONFERMATA', 'CANCELLATA']);
export const tipoPagamentoEnum = pgEnum('tipo_pagamento', ['COMPLETO', 'ACCONTO']);
export const metodoPagamentoEnum = pgEnum('metodo_pagamento', ['CARTA', 'PAYPAL', 'SATISPAY', 'DA_CONCORDARE']);
export const statoTourLeaderEnum = pgEnum('stato_tour_leader', ['CANDIDATO', 'ATTIVO', 'ARCHIVIATO']);
export const tipoCouponEnum = pgEnum('tipo_coupon', ['PERCENTUALE', 'FISSO']);
export const autoreMessaggioEnum = pgEnum('autore_messaggio', ['CLIENTE', 'ADMIN']);
export const statoListaAttesaEnum = pgEnum('stato_lista_attesa', ['IN_ATTESA', 'PROMOSSA']);
// Etichetta di scarsità/abbondanza mostrata ai clienti al posto del
// numero esatto di posti — impostata a mano dal gestionale, indipendente
// dai posti reali (serve per creare percezione di scarsità o urgenza).
export const statoDisponibilitaEnum = pgEnum('stato_disponibilita', ['POCHI_POSTI', 'NUOVI_POSTI', 'ESAURITO']);
// Deprecato: sostituito dal sistema di ruoli dinamici (tabella `ruoli`).
// Lasciato solo per leggere i valori esistenti durante la migrazione
// (vedi src/db/migra-permessi.ts). Rimuovibile dopo la migrazione.
export const ruoloAdminEnum = pgEnum('ruolo_admin', ['AMMINISTRATORE', 'OPERATORE', 'COLLABORATORE']);

// ---------------------------------------------------------------------
// EVENTI
// ---------------------------------------------------------------------
export const eventi = pgTable('eventi', {
  id: id(),
  artista: text('artista').notNull(),
  genere: text('genere').notNull(),
  luogo: text('luogo').notNull(),
  citta: text('citta').notNull(),
  data: timestamp('data', { mode: 'date' }).notNull(),
  // Non più obbligatorio: i prezzi arrivano dalle fermate delle tratte.
  // Resta solo come riferimento residuo per eventi creati prima di questa
  // modifica, o per il caso limite di un evento senza nessuna tratta.
  prezzo: numeric('prezzo', { precision: 10, scale: 2 }),
  inEvidenza: boolean('in_evidenza').notNull().default(false),
  ordineEvidenza: integer('ordine_evidenza').notNull().default(0),
  vetrinaDal: timestamp('vetrina_dal', { mode: 'date' }),
  vetrinaAl: timestamp('vetrina_al', { mode: 'date' }),
  // Acconto specifico per questo evento (in euro). Se non impostato,
  // si usa il default globale (variabile d'ambiente ACCONTO_FISSO_EUR).
  accontoEur: numeric('acconto_eur', { precision: 10, scale: 2 }),
  // Null = nessun avviso (comportamento normale). Impostato a mano
  // dal gestionale, si applica a tutte le tratte/fermate dell'evento.
  statoDisponibilita: statoDisponibilitaEnum('stato_disponibilita'),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
  aggiornatoIl: timestamp('aggiornato_il').notNull().defaultNow(),
});

export const immaginiEvento = pgTable('immagini_evento', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), // in produzione: URL su storage tipo S3/Cloudinary
  ordine: integer('ordine').notNull().default(0),
});

export const allegatiEvento = pgTable('allegati_evento', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  url: text('url').notNull(),
});

// ---------------------------------------------------------------------
// FORNITORI (agenzie bus) — dichiarati prima delle linee per il riferimento
// ---------------------------------------------------------------------
export const fornitori = pgTable('fornitori', {
  id: id(),
  nome: text('nome').notNull(),
  partitaIva: text('partita_iva'),
  referente: text('referente'),
  telefono: text('telefono'),
  email: text('email'),
  indirizzo: text('indirizzo'),
  note: text('note'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
});

// ---------------------------------------------------------------------
// LINEE BUS (contenitore con posti propri) + FERMATE
// ---------------------------------------------------------------------
export const lineeBus = pgTable('linee_bus', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  postiTotali: integer('posti_totali').notNull(),
  postiDisponibili: integer('posti_disponibili').notNull(),
  prezzoExtra: numeric('prezzo_extra', { precision: 10, scale: 2 }).notNull().default('0'),
  referenteNome: text('referente_nome'),
  referenteTelefono: text('referente_telefono'),
  fornitoreId: text('fornitore_id').references(() => fornitori.id),
  // Sezione "Partenze": indica se questa tratta è coperta (bus prenotato
  // con l'agenzia/fornitore), a prescindere dal calcolo automatico dei
  // bus necessari, che resta solo un suggerimento.
  coperta: boolean('coperta').notNull().default(false),
  noteCoperta: text('note_coperta'),
});

export const fermate = pgTable('fermate', {
  id: id(),
  lineaId: text('linea_id').notNull().references(() => lineeBus.id, { onDelete: 'cascade' }),
  ordine: integer('ordine').notNull().default(0),
  citta: text('citta').notNull(),
  indirizzo: text('indirizzo').notNull(),
  orario: text('orario'), // HH:MM (partenza/andata)
  orarioRitorno: text('orario_ritorno'),
  indirizzoRitorno: text('indirizzo_ritorno'),
  prezzo: numeric('prezzo', { precision: 10, scale: 2 }), // sovrascrive prezzo evento+extra se impostato
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
});

// ---------------------------------------------------------------------
// BUS FISICI (Sezione Partenze: censimento dei mezzi reali e delle tratte
// che coprono)
// ---------------------------------------------------------------------
export const busFisici = pgTable('bus_fisici', {
  id: id(),
  fornitoreId: text('fornitore_id').references(() => fornitori.id),
  riferimento: text('riferimento').notNull(), // es. targa, o riferimento dato dall'agenzia
  autistaNome: text('autista_nome'),
  autistaTelefono: text('autista_telefono'),
  note: text('note'),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
});

// Un bus può coprire più tratte (linee) diverse; una tratta può essere
// coperta da più bus se la capienza di uno solo non basta.
export const busTratte = pgTable('bus_tratte', {
  busId: text('bus_id').notNull().references(() => busFisici.id, { onDelete: 'cascade' }),
  lineaId: text('linea_id').notNull().references(() => lineeBus.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.busId, t.lineaId] }),
}));

// ---------------------------------------------------------------------
// TRAGITTI (template riutilizzabili di fermate)
// ---------------------------------------------------------------------
export const tragitti = pgTable('tragitti', {
  id: id(),
  nome: text('nome').notNull(),
});

export const fermateTragitto = pgTable('fermate_tragitto', {
  id: id(),
  tragittoId: text('tragitto_id').notNull().references(() => tragitti.id, { onDelete: 'cascade' }),
  ordine: integer('ordine').notNull().default(0),
  citta: text('citta').notNull(),
  indirizzo: text('indirizzo').notNull(),
  orario: text('orario'),
  prezzo: numeric('prezzo', { precision: 10, scale: 2 }),
});

// ---------------------------------------------------------------------
// UTENTI (clienti)
// ---------------------------------------------------------------------
export const utenti = pgTable('utenti', {
  id: id(),
  nome: text('nome'),
  cognome: text('cognome'),
  email: text('email').notNull().unique(),
  telefono: text('telefono'),
  codiceFiscale: text('codice_fiscale'),
  dataNascita: timestamp('data_nascita', { mode: 'date' }),
  indirizzo: text('indirizzo'),
  citta: text('citta'),
  cap: text('cap'),
  note: text('note'),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// PRENOTAZIONI (transazioni)
// ---------------------------------------------------------------------
export const prenotazioni = pgTable('prenotazioni', {
  id: id(),
  pnr: text('pnr').notNull().unique(),
  eventoId: text('evento_id').notNull().references(() => eventi.id),
  lineaId: text('linea_id').notNull().references(() => lineeBus.id),
  fermataCitta: text('fermata_citta').notNull(),
  fermataIndirizzo: text('fermata_indirizzo'),
  fermataOrario: text('fermata_orario'),
  orarioRitorno: text('orario_ritorno'),
  indirizzoRitorno: text('indirizzo_ritorno'),
  referenteNome: text('referente_nome'),
  referenteTelefono: text('referente_telefono'),
  passeggeri: integer('passeggeri').notNull(),
  totale: numeric('totale', { precision: 10, scale: 2 }).notNull(),
  sconto: numeric('sconto', { precision: 10, scale: 2 }).notNull().default('0'),
  couponCodice: text('coupon_codice'),
  tipoPagamento: tipoPagamentoEnum('tipo_pagamento').notNull().default('COMPLETO'),
  saldoPagato: boolean('saldo_pagato').notNull().default(true),
  scadenzaSaldo: timestamp('scadenza_saldo', { mode: 'date' }),
  metodoPagamento: metodoPagamentoEnum('metodo_pagamento').notNull().default('CARTA'),
  utenteId: text('utente_id').notNull().references(() => utenti.id),
  promoterCodice: text('promoter_codice'),
  stato: statoPrenotazioneEnum('stato').notNull().default('CONFERMATA'),
  motivoCancellazione: text('motivo_cancellazione'),
  rimborsoStato: text('rimborso_stato'), // 'richiesto' | 'approvato'
  rimborsoImporto: numeric('rimborso_importo', { precision: 10, scale: 2 }),
  rimborsoData: timestamp('rimborso_data'),
  // Evita di rimandare più volte lo stesso promemoria "salda il resto".
  promemoriaSaldoInviato: boolean('promemoria_saldo_inviato').notNull().default(false),
  creataIl: timestamp('creata_il').notNull().defaultNow(),
});

// Un partecipante per passeggero della prenotazione (il richiedente è
// sempre il primo, ordine 0 — i suoi contatti completi, email e telefono,
// restano sulla tabella utenti/prenotazioni; qui serve solo nome+cognome
// di ognuno per l'elenco passeggeri nel gestionale).
export const partecipantiPrenotazione = pgTable('partecipanti_prenotazione', {
  id: id(),
  prenotazioneId: text('prenotazione_id').notNull().references(() => prenotazioni.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  cognome: text('cognome').notNull(),
  ordine: integer('ordine').notNull().default(0),
});

// ---------------------------------------------------------------------
// PROMOTER
// ---------------------------------------------------------------------
export const promoter = pgTable('promoter', {
  id: id(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  telefono: text('telefono'),
  passwordHash: text('password_hash').notNull(),
  codice: text('codice').notNull().unique(),
  commissionePercentuale: numeric('commissione_percentuale', { precision: 5, scale: 2 }).notNull().default('10'),
  note: text('note'),
});

export const promoterEventi = pgTable('promoter_eventi', {
  promoterId: text('promoter_id').notNull().references(() => promoter.id, { onDelete: 'cascade' }),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.promoterId, t.eventoId] }),
}));

// ---------------------------------------------------------------------
// TOUR LEADER
// ---------------------------------------------------------------------
export const tourLeader = pgTable('tour_leader', {
  id: id(),
  nome: text('nome').notNull(),
  cognome: text('cognome').notNull(),
  email: text('email').notNull(),
  telefono: text('telefono'),
  dataNascita: timestamp('data_nascita', { mode: 'date' }),
  citta: text('citta'),
  lingue: text('lingue'),
  disponibilita: text('disponibilita'),
  esperienza: text('esperienza'),
  stato: statoTourLeaderEnum('stato').notNull().default('CANDIDATO'),
  eventoRiferimento: text('evento_riferimento').references(() => eventi.id, { onDelete: 'set null' }),
  note: text('note'),
  dataCandidatura: timestamp('data_candidatura').notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// COUPON
// ---------------------------------------------------------------------
export const coupon = pgTable('coupon', {
  id: id(),
  codice: text('codice').notNull().unique(),
  tipo: tipoCouponEnum('tipo').notNull(),
  valore: numeric('valore', { precision: 10, scale: 2 }).notNull(),
  usiMax: integer('usi_max'),
  usiAttuali: integer('usi_attuali').notNull().default(0),
  validoDal: timestamp('valido_dal', { mode: 'date' }),
  validoAl: timestamp('valido_al', { mode: 'date' }),
  attivo: boolean('attivo').notNull().default(true),
});

// ---------------------------------------------------------------------
// CHAT
// ---------------------------------------------------------------------
export const messaggiChat = pgTable('messaggi_chat', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  autore: autoreMessaggioEnum('autore').notNull(),
  nome: text('nome').notNull(),
  email: text('email'),
  testo: text('testo').notNull(),
  letto: boolean('letto').notNull().default(false),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// LISTA D'ATTESA
// ---------------------------------------------------------------------
export const listaAttesa = pgTable('lista_attesa', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  cognome: text('cognome'),
  email: text('email').notNull(),
  telefono: text('telefono'),
  passeggeri: integer('passeggeri').notNull(),
  // Tratta/fermata preferita (facoltativa: potrebbe non essercene una
  // con posti quando si iscrive) — usata per precompilare il checkout
  // quando viene promossa.
  lineaId: text('linea_id').references(() => lineeBus.id, { onDelete: 'set null' }),
  fermataId: text('fermata_id').references(() => fermate.id, { onDelete: 'set null' }),
  // Un passeggero per riga OLTRE al richiedente, come nel checkout
  // normale: [{nome,cognome}, ...]. Salvato come JSON per semplicità,
  // non serve interrogarlo separatamente.
  partecipantiJson: text('partecipanti_json'),
  stato: statoListaAttesaEnum('stato').notNull().default('IN_ATTESA'),
  // Token univoco per il link "completa la tua prenotazione" nell'email
  // di promozione — generato quando l'iscrizione viene promossa.
  token: text('token').unique(),
  emailInviata: boolean('email_inviata').notNull().default(false),
  // Vero quando il cliente ha davvero completato la prenotazione dal
  // link ricevuto (per non permettere di riusarlo due volte).
  completata: boolean('completata').notNull().default(false),
  dataCreazione: timestamp('data_creazione').notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// RUOLI E PERMESSI (dinamici, configurabili dal gestionale)
// ---------------------------------------------------------------------

// I ruoli non sono più fissi nel codice: sono righe create dagli utenti
// autorizzati, con nome libero e permessi assegnabili a piacere.
export const ruoli = pgTable('ruoli', {
  id: id(),
  nome: text('nome').notNull().unique(),
  descrizione: text('descrizione'),
  // Il ruolo "owner" ha SEMPRE tutti i permessi, presenti e futuri, a
  // prescindere da cosa è assegnato in ruolo_permessi. Non è eliminabile
  // e non è modificabile nei permessi (per non poter mai restare senza
  // nessuno con accesso completo). Deve essercene sempre almeno uno.
  owner: boolean('owner').notNull().default(false),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
});

// Elenco di TUTTI i permessi esistenti nell'app, sincronizzato in automatico
// dal registro nel codice (src/shared/permessi-registro.ts) ad ogni avvio.
export const permessi = pgTable('permessi', {
  chiave: text('chiave').primaryKey(), // es. 'eventi.crea'
  etichetta: text('etichetta').notNull(),
  modulo: text('modulo').notNull(),
  attivo: boolean('attivo').notNull().default(true), // false se rimosso dal registro
});

// Quali permessi ha ogni ruolo (ignorato per i ruoli con owner = true).
export const ruoloPermessi = pgTable('ruolo_permessi', {
  ruoloId: text('ruolo_id').notNull().references(() => ruoli.id, { onDelete: 'cascade' }),
  permessoChiave: text('permesso_chiave').notNull().references(() => permessi.chiave, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.ruoloId, t.permessoChiave] }),
}));

// ---------------------------------------------------------------------
// AMMINISTRATORI (utenze del gestionale) + LOG
// ---------------------------------------------------------------------
export const amministratori = pgTable('amministratori', {
  id: id(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  ruoloId: text('ruolo_id').notNull().references(() => ruoli.id),
  attivo: boolean('attivo').notNull().default(true),
});

// Eccezioni per singolo amministratore: se presente una riga, sovrascrive
// quello che darebbe il ruolo. `concesso = true` forza il permesso anche
// se il ruolo non ce l'ha; `concesso = false` lo toglie anche se il ruolo
// ce l'ha. Ignorato per gli amministratori con ruolo owner (hanno sempre
// tutto, le eccezioni non hanno effetto).
export const amministratorePermessi = pgTable('amministratore_permessi', {
  amministratoreId: text('amministratore_id').notNull().references(() => amministratori.id, { onDelete: 'cascade' }),
  permessoChiave: text('permesso_chiave').notNull().references(() => permessi.chiave, { onDelete: 'cascade' }),
  concesso: boolean('concesso').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.amministratoreId, t.permessoChiave] }),
}));

export const logAttivita = pgTable('log_attivita', {
  id: id(),
  amministratoreId: text('amministratore_id').references(() => amministratori.id),
  azione: text('azione').notNull(),
  dettaglio: text('dettaglio'),
  data: timestamp('data').notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// CATEGORIE EVENTI
// ---------------------------------------------------------------------
export const categorie = pgTable('categorie', {
  id: id(),
  nome: text('nome').notNull().unique(),
});

// ---------------------------------------------------------------------
// PAGINE CMS + CONTENUTI SITO + IMPOSTAZIONI
// ---------------------------------------------------------------------
export const pagineCms = pgTable('pagine_cms', {
  chiave: text('chiave').primaryKey(), // 'faq' | 'privacy' | 'cookie' | 'termini' | 'lavora' | 'chisiamo' | 'contatti'
  titolo: text('titolo').notNull(),
  contenuto: text('contenuto').notNull(),
});

export const contenutiSito = pgTable('contenuti_sito', {
  chiave: text('chiave').primaryKey(), // 'heroTitleLine1', 'stat1Num', 'whatsappNumero', ecc.
  valore: text('valore').notNull(),
});

export const impostazioni = pgTable('impostazioni', {
  chiave: text('chiave').primaryKey(),
  valore: text('valore').notNull(),
});

// ---------------------------------------------------------------------
// RELAZIONI (per le query .with{} di Drizzle)
// ---------------------------------------------------------------------
export const eventiRelations = relations(eventi, ({ many }) => ({
  immagini: many(immaginiEvento),
  allegati: many(allegatiEvento),
  linee: many(lineeBus),
  prenotazioni: many(prenotazioni),
  messaggiChat: many(messaggiChat),
  listaAttesa: many(listaAttesa),
}));

// Drizzle richiede la relazione dichiarata su ENTRAMBI i lati per poter
// risolvere i join delle query .with{} — qui sotto il lato "one" di ogni
// relazione many() dichiarata sopra su eventiRelations.
export const immaginiEventoRelations = relations(immaginiEvento, ({ one }) => ({
  evento: one(eventi, { fields: [immaginiEvento.eventoId], references: [eventi.id] }),
}));

export const allegatiEventoRelations = relations(allegatiEvento, ({ one }) => ({
  evento: one(eventi, { fields: [allegatiEvento.eventoId], references: [eventi.id] }),
}));

export const messaggiChatRelations = relations(messaggiChat, ({ one }) => ({
  evento: one(eventi, { fields: [messaggiChat.eventoId], references: [eventi.id] }),
}));

export const listaAttesaRelations = relations(listaAttesa, ({ one }) => ({
  evento: one(eventi, { fields: [listaAttesa.eventoId], references: [eventi.id] }),
}));

export const lineeBusRelations = relations(lineeBus, ({ one, many }) => ({
  evento: one(eventi, { fields: [lineeBus.eventoId], references: [eventi.id] }),
  fornitore: one(fornitori, { fields: [lineeBus.fornitoreId], references: [fornitori.id] }),
  fermate: many(fermate),
  prenotazioni: many(prenotazioni),
  busAssegnati: many(busTratte),
}));

export const fermateRelations = relations(fermate, ({ one }) => ({
  linea: one(lineeBus, { fields: [fermate.lineaId], references: [lineeBus.id] }),
}));

export const busFisiciRelations = relations(busFisici, ({ one, many }) => ({
  fornitore: one(fornitori, { fields: [busFisici.fornitoreId], references: [fornitori.id] }),
  tratte: many(busTratte),
}));

export const busTratteRelations = relations(busTratte, ({ one }) => ({
  bus: one(busFisici, { fields: [busTratte.busId], references: [busFisici.id] }),
  linea: one(lineeBus, { fields: [busTratte.lineaId], references: [lineeBus.id] }),
}));

export const tragittiRelations = relations(tragitti, ({ many }) => ({
  fermate: many(fermateTragitto),
}));

export const fermateTragittoRelations = relations(fermateTragitto, ({ one }) => ({
  tragitto: one(tragitti, { fields: [fermateTragitto.tragittoId], references: [tragitti.id] }),
}));

export const prenotazioniRelations = relations(prenotazioni, ({ one, many }) => ({
  evento: one(eventi, { fields: [prenotazioni.eventoId], references: [eventi.id] }),
  linea: one(lineeBus, { fields: [prenotazioni.lineaId], references: [lineeBus.id] }),
  utente: one(utenti, { fields: [prenotazioni.utenteId], references: [utenti.id] }),
  partecipanti: many(partecipantiPrenotazione),
}));

export const partecipantiPrenotazioneRelations = relations(partecipantiPrenotazione, ({ one }) => ({
  prenotazione: one(prenotazioni, { fields: [partecipantiPrenotazione.prenotazioneId], references: [prenotazioni.id] }),
}));

export const utentiRelations = relations(utenti, ({ many }) => ({
  prenotazioni: many(prenotazioni),
}));

export const promoterRelations = relations(promoter, ({ many }) => ({
  eventiAbilitati: many(promoterEventi),
}));

export const promoterEventiRelations = relations(promoterEventi, ({ one }) => ({
  promoter: one(promoter, { fields: [promoterEventi.promoterId], references: [promoter.id] }),
  evento: one(eventi, { fields: [promoterEventi.eventoId], references: [eventi.id] }),
}));

export const ruoliRelations = relations(ruoli, ({ many }) => ({
  permessi: many(ruoloPermessi),
  amministratori: many(amministratori),
}));

export const ruoloPermessiRelations = relations(ruoloPermessi, ({ one }) => ({
  ruolo: one(ruoli, { fields: [ruoloPermessi.ruoloId], references: [ruoli.id] }),
  permesso: one(permessi, { fields: [ruoloPermessi.permessoChiave], references: [permessi.chiave] }),
}));

export const amministratoriRelations = relations(amministratori, ({ one, many }) => ({
  ruolo: one(ruoli, { fields: [amministratori.ruoloId], references: [ruoli.id] }),
  permessiExtra: many(amministratorePermessi),
}));

export const amministratorePermessiRelations = relations(amministratorePermessi, ({ one }) => ({
  amministratore: one(amministratori, { fields: [amministratorePermessi.amministratoreId], references: [amministratori.id] }),
  permesso: one(permessi, { fields: [amministratorePermessi.permessoChiave], references: [permessi.chiave] }),
}));
