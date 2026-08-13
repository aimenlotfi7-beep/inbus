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
  prezzo: numeric('prezzo', { precision: 10, scale: 2 }).notNull(),
  inEvidenza: boolean('in_evidenza').notNull().default(false),
  ordineEvidenza: integer('ordine_evidenza').notNull().default(0),
  vetrinaDal: timestamp('vetrina_dal', { mode: 'date' }),
  vetrinaAl: timestamp('vetrina_al', { mode: 'date' }),
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
  creataIl: timestamp('creata_il').notNull().defaultNow(),
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
  eventoRiferimento: text('evento_riferimento').references(() => eventi.id),
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
  email: text('email').notNull(),
  telefono: text('telefono'),
  passeggeri: integer('passeggeri').notNull(),
  stato: statoListaAttesaEnum('stato').notNull().default('IN_ATTESA'),
  dataCreazione: timestamp('data_creazione').notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// AMMINISTRATORI (ruoli) + LOG
// ---------------------------------------------------------------------
export const amministratori = pgTable('amministratori', {
  id: id(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  ruolo: ruoloAdminEnum('ruolo').notNull().default('OPERATORE'),
  attivo: boolean('attivo').notNull().default(true),
});

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
}));

export const fermateRelations = relations(fermate, ({ one }) => ({
  linea: one(lineeBus, { fields: [fermate.lineaId], references: [lineeBus.id] }),
}));

export const tragittiRelations = relations(tragitti, ({ many }) => ({
  fermate: many(fermateTragitto),
}));

export const fermateTragittoRelations = relations(fermateTragitto, ({ one }) => ({
  tragitto: one(tragitti, { fields: [fermateTragitto.tragittoId], references: [tragitti.id] }),
}));

export const prenotazioniRelations = relations(prenotazioni, ({ one }) => ({
  evento: one(eventi, { fields: [prenotazioni.eventoId], references: [eventi.id] }),
  linea: one(lineeBus, { fields: [prenotazioni.lineaId], references: [lineeBus.id] }),
  utente: one(utenti, { fields: [prenotazioni.utenteId], references: [utenti.id] }),
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
