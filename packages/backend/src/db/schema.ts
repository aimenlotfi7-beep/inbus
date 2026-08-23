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
export const statoTicketEnum = pgEnum('stato_ticket', ['EMESSO', 'UTILIZZATO', 'ANNULLATO']);
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
  // Indirizzo pubblico leggibile (es. "salmo-roma") — ogni evento ha una
  // sua pagina vera a /eventi/:slug, indicizzabile da Google e
  // condivisibile con un'anteprima propria (a differenza di prima, dove
  // tutto viveva solo dentro la home come popup).
  slug: text('slug').notNull().unique(),
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
  // L'arrivo (destinazione + orario) è unico per l'evento e si applica a
  // tutte le sue tratte — è l'ancora da cui si calcolano a ritroso gli
  // orari delle fermate. Non è nel tragitto perché la destinazione
  // cambia a ogni evento anche riusando lo stesso tragitto di fermate.
  arrivoIndirizzo: text('arrivo_indirizzo'),
  arrivoOrario: text('arrivo_orario'),
  // Controllo manuale indipendente dalla data: se falso, l'evento non
  // compare mai sul sito pubblico, nemmeno se è nel futuro. Se vero
  // (default), vale comunque la regola "non visibile dopo la data
  // dell'evento" applicata separatamente.
  visibileSito: boolean('visibile_sito').notNull().default(true),
  // Vero mentre l'evento è ancora in fase di creazione, non ancora
  // confermato dall'amministratore — salvato in automatico man mano che
  // si compila il modulo "Nuovo evento", così un'uscita accidentale (o
  // un ricaricamento della pagina) non fa perdere il lavoro fatto. Non
  // compare mai sul sito pubblico, a prescindere da "visibileSito".
  bozza: boolean('bozza').notNull().default(false),
  // Cestino: un evento "eliminato" non sparisce per davvero dal
  // database (le prenotazioni collegate resterebbero orfane) — resta
  // lì, solo nascosto da ogni vista normale, recuperabile dal Cestino.
  eliminatoIl: timestamp('eliminato_il'),
  // Testo libero mostrato nella pagina pubblica dell'evento, sotto la
  // foto — orari di ritrovo, cosa portare, regole del bus, ecc. Diverso
  // dalla descrizione SEO qui sotto: questa è per il CLIENTE che ha già
  // trovato la pagina, l'altra è per farla trovare su Google.
  descrizione: text('descrizione'),
  // Testo mostrato nei risultati di Google e nelle anteprime social
  // (WhatsApp/Facebook) quando si condivide il link — se non lo
  // compili, il sito ne genera uno automaticamente (artista, data,
  // città, prezzo). Facoltativo apposta: non tutti vorranno scriverne
  // uno su misura per ogni evento.
  descrizioneSeo: text('descrizione_seo'),
  // Personalizzazione del biglietto digitale (PDF) per questo evento
  // specifico — entrambi facoltativi: se non impostati, il biglietto usa
  // l'aspetto di base (nero su bianco).
  ticketColoreAccento: text('ticket_colore_accento'), // es. "#dc2626"
  ticketImmagineSfondoUrl: text('ticket_immagine_sfondo_url'),
  // Quale layout (composizione grafica) usa il biglietto di questo
  // evento — se non impostato, usa quello segnato come "predefinito".
  layoutBigliettoId: text('layout_biglietto_id').references(() => layoutBiglietto.id, { onDelete: 'set null' }),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
  aggiornatoIl: timestamp('aggiornato_il').notNull().defaultNow(),
});

export const immaginiEvento = pgTable('immagini_evento', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), // in produzione: URL su storage tipo S3/Cloudinary
  ordine: integer('ordine').notNull().default(0),
});

// ---------------------------------------------------------------------
// MARKETING: campagne pubblicitarie e offerte con prezzo dedicato
// ---------------------------------------------------------------------

// Una campagna pubblicitaria (Meta, Google, newsletter, ecc.) — serve a
// sapere da dove arriva un cliente, indipendentemente dal fatto che usi
// o meno un'offerta con prezzo scontato.
export const campagne = pgTable('campagne', {
  id: id(),
  nome: text('nome').notNull(),
  piattaforma: text('piattaforma'), // testo libero: es. "Meta", "Google", "Instagram", "Newsletter"
  tipo: text('tipo'), // testo libero: es. "Retargeting", "Acquisizione"
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  attiva: boolean('attiva').notNull().default(true),
  creataIl: timestamp('creata_il').notNull().defaultNow(),
});

// Un link con uno SCONTO PERCENTUALE dedicato per un evento specifico
// (es. "-20% su tutte le tratte" per chi arriva da una campagna Meta),
// applicato al prezzo normale di qualunque fermata scelga il cliente —
// non un prezzo fisso, perché il prezzo varia già per fermata. Il link
// pubblico porta solo lo slug, mai lo sconto, così non è modificabile
// dal browser.
export const offerteEvento = pgTable('offerte_evento', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  campagnaId: text('campagna_id').references(() => campagne.id, { onDelete: 'set null' }),
  nome: text('nome').notNull(),
  slug: text('slug').notNull().unique(),
  // Es. 20.00 = -20% sul prezzo normale di ogni fermata.
  scontoPercentuale: numeric('sconto_percentuale', { precision: 5, scale: 2 }).notNull(),
  attiva: boolean('attiva').notNull().default(true),
  validoDal: timestamp('valido_dal'),
  validoAl: timestamp('valido_al'),
  limiteUtilizzi: integer('limite_utilizzi'),
  utilizzi: integer('utilizzi').notNull().default(0),
  creataIl: timestamp('creata_il').notNull().defaultNow(),
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
  // Stesso principio del cestino eventi qui sopra — una tratta con
  // prenotazioni collegate non può essere cancellata per davvero senza
  // lasciarle orfane, quindi la si "nasconde" invece di eliminarla.
  eliminatoIl: timestamp('eliminato_il'),
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
  // Limite posti specifico di questa fermata (facoltativo). Se non
  // impostato, questa fermata condivide semplicemente i posti di tutto
  // il bus (comportamento di prima). Se impostato, quando si esaurisce
  // SOLO questa fermata risulta piena — le altre fermate dello stesso
  // bus restano prenotabili normalmente.
  postiMax: integer('posti_max'),
  postiPrenotati: integer('posti_prenotati').notNull().default(0),
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
  // Il tour leader assegnato a questo bus (censito nell'apposita sezione).
  // Nullo se il bus non ha ancora un tour leader assegnato; se il tour
  // leader viene eliminato, l'assegnazione si scollega da sola invece di
  // bloccare l'eliminazione.
  tourLeaderId: text('tour_leader_id').references(() => tourLeader.id, { onDelete: 'set null' }),
  // Quanto costa questo bus (noleggio/fornitore) per questo evento —
  // usato per calcolare il guadagno reale di ogni tratta (incassato -
  // costo). Facoltativo: se non lo compili, quella tratta risulta senza
  // costo censito, non zero per errore.
  costo: numeric('costo', { precision: 10, scale: 2 }),
  // Quanti posti ha davvero questo bus specifico — usato per calcolare
  // in automatico se la tratta è "coperta" (somma dei posti dei bus
  // censiti su quella tratta >= passeggeri confermati). Facoltativo: se
  // non lo compili, questo bus non contribuisce al calcolo automatico
  // (meglio "non contribuisce" che assumere un numero a caso).
  postiBus: integer('posti_bus'),
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
  // Credito fedeltà: matura dopo ogni viaggio DAVVERO avvenuto (non alla
  // prenotazione — altrimenti basterebbe prenotare e cancellare per
  // accumularlo gratis), spendibile su qualsiasi prenotazione futura,
  // si somma sempre alle offerte, non scade mai. Il dettaglio di ogni
  // movimento (guadagnato/speso) sta in movimentiCredito qui sotto —
  // questo campo è solo il saldo attuale, per non dover sommare la
  // tabella intera ogni volta che serve mostrarlo.
  creditoDisponibile: numeric('credito_disponibile', { precision: 10, scale: 2 }).notNull().default('0'),
  // Consensi privacy — ognuno con la propria data: il GDPR richiede di
  // poter DIMOSTRARE quando è stato dato un consenso, non solo che c'è.
  // Nullo = non ancora scelto (mai mostrare come "acconsentito" di
  // default: dev'essere sempre una scelta attiva del cliente).
  presaVisioneInformativa: boolean('presa_visione_informativa'),
  presaVisioneInformativaData: timestamp('presa_visione_informativa_data'),
  consensoMarketing: boolean('consenso_marketing'),
  consensoMarketingData: timestamp('consenso_marketing_data'),
  consensoProfilazione: boolean('consenso_profilazione'),
  consensoProfilazioneData: timestamp('consenso_profilazione_data'),
  // Account vero — password sempre salvata con hash, mai in chiaro.
  // Nullo per i clienti "vecchi" (creati prima di questo sistema, solo
  // con l'email di allora) — dovranno registrarsi per la prima volta,
  // com'è giusto che sia, dato che oggi serve un account per prenotare.
  passwordHash: text('password_hash'),
  // L'email va confermata cliccando un link prima che l'account sia
  // utilizzabile per accedere — il token è quello dentro il link,
  // valido una volta sola e con scadenza.
  emailVerificata: boolean('email_verificata').notNull().default(false),
  tokenVerificaEmail: text('token_verifica_email'),
  tokenVerificaScadenza: timestamp('token_verifica_scadenza'),
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
  // Quando è stato saldato per davvero (solo per chi ha pagato ad
  // acconto) — usata per mostrare uno storico vero nel gestionale
  // (creata il X, saldata il Y), non solo lo stato attuale.
  saldoPagatoIl: timestamp('saldo_pagato_il'),
  // Credito fedeltà usato per pagare (in parte o del tutto) questa
  // prenotazione — si somma allo sconto di un'eventuale offerta, non la
  // sostituisce. "creditoMaturato" impedisce che lo stesso viaggio
  // faccia guadagnare credito due volte (lo scheduler giornaliero lo
  // controlla prima di assegnarlo).
  creditoUsato: numeric('credito_usato', { precision: 10, scale: 2 }).notNull().default('0'),
  creditoMaturato: boolean('credito_maturato').notNull().default(false),
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
  // Marketing: se la prenotazione arriva da un link con offerta dedicata
  // e/o da una campagna tracciata (anche senza offerta, solo UTM).
  offertaId: text('offerta_id').references(() => offerteEvento.id, { onDelete: 'set null' }),
  campagnaId: text('campagna_id').references(() => campagne.id, { onDelete: 'set null' }),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  // Biglietto digitale (PDF + QR): emesso solo quando la prenotazione è
  // pagata per intero (subito se paga tutto, oppure dopo aver saldato
  // il resto se aveva pagato ad acconto). ticketToken è quello che finisce
  // nel QR — non il PNR — così il codice a barre resta separato dal
  // riferimento leggibile mostrato al cliente. "UTILIZZATO"/"ANNULLATO"
  // non sono ancora usati da nessuna parte del codice: sono pronti per
  // quando costruiremo l'app di controllo accessi sul bus, per non dover
  // fare un'altra migrazione più avanti.
  ticketToken: text('ticket_token').unique(),
  ticketStato: statoTicketEnum('ticket_stato'),
  ticketEmessoIl: timestamp('ticket_emesso_il'),
  ticketUtilizzatoIl: timestamp('ticket_utilizzato_il'),
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
  // QR univoco PER QUESTA PERSONA — diverso dal token sulla
  // prenotazione (che resta per "il biglietto è stato emesso"): questo
  // serve al controllo accessi sul bus, per contare davvero chi è
  // salito, persona per persona, non per gruppo intero.
  ticketToken: text('ticket_token').unique(),
  ticketUtilizzatoIl: timestamp('ticket_utilizzato_il'),
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
  // Accesso all'app di controllo scansione biglietti — vuoto finché
  // l'amministratore non attiva le credenziali per questo tour leader
  // (di solito quando gli assegna un bus vero). Password sempre salvata
  // con hash, mai in chiaro — stesso meccanismo già usato per gli
  // amministratori.
  passwordHash: text('password_hash'),
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
  // Vuoto = valido su tutti gli eventi. Se impostato, il coupon
  // funziona solo su quello specifico.
  eventoId: text('evento_id').references(() => eventi.id, { onDelete: 'cascade' }),
});

// ---------------------------------------------------------------------
// CHAT
// ---------------------------------------------------------------------
// Una conversazione per cliente — prima i messaggi finivano tutti
// mischiati per evento, senza separare chi scriveva cosa. Quando
// l'admin la chiude, un nuovo messaggio del cliente ne apre una NUOVA
// (non riapre quella vecchia) — lo storico resta comunque consultabile.
export const statoConversazioneEnum = pgEnum('stato_conversazione', ['APERTA', 'IN_CORSO', 'CHIUSA']);
export const conversazioniChat = pgTable('conversazioni_chat', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  clienteEmail: text('cliente_email').notNull(),
  clienteNome: text('cliente_nome').notNull(),
  stato: statoConversazioneEnum('stato').notNull().default('APERTA'),
  creataIl: timestamp('creata_il').notNull().defaultNow(),
  ultimoMessaggioIl: timestamp('ultimo_messaggio_il').notNull().defaultNow(),
});

export const messaggiChat = pgTable('messaggi_chat', {
  id: id(),
  eventoId: text('evento_id').notNull().references(() => eventi.id, { onDelete: 'cascade' }),
  conversazioneId: text('conversazione_id').references(() => conversazioniChat.id, { onDelete: 'cascade' }),
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

// Layout (composizione grafica) del biglietto digitale PDF — salvabili,
// nominabili, uno di questi è sempre segnato come "predefinito" (quello
// usato da un evento che non ne ha scelto uno suo). "configurazione" è
// un testo JSON con l'ordine delle sezioni, la dimensione/posizione del
// QR, colori — vedi layout-biglietto.service.ts per la struttura esatta
// e il valore di base.
// Storico di ogni singolo movimento di credito fedeltà — positivo
// quando maturato dopo un viaggio, negativo quando speso su una
// prenotazione. Serve per trasparenza (far vedere al cliente/a te da
// dove arriva un saldo) — utenti.creditoDisponibile resta comunque il
// saldo "pronto all'uso", non serve sommare questa tabella ogni volta.
export const movimentiCredito = pgTable('movimenti_credito', {
  id: id(),
  utenteId: text('utente_id').notNull().references(() => utenti.id, { onDelete: 'cascade' }),
  importo: numeric('importo', { precision: 10, scale: 2 }).notNull(), // positivo = guadagnato, negativo = speso
  motivo: text('motivo').notNull(), // es. "Viaggio completato — PNR IB1234" oppure "Usato su prenotazione IB5678"
  prenotazioneId: text('prenotazione_id').references(() => prenotazioni.id, { onDelete: 'set null' }),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
});

// Richieste di rimborso — il cliente non può più cancellare da solo la
// sua prenotazione (aveva senso finché il credito maturava dopo il
// viaggio; ora che matura subito al pagamento, sarebbe una scappatoia
// per farmarlo gratis prenotando e cancellando). Ogni richiesta passa
// dall'amministratore: approvandola, la prenotazione viene cancellata
// per davvero e l'eventuale credito già maturato viene tolto.
export const statoRichiestaRimborsoEnum = pgEnum('stato_richiesta_rimborso', ['IN_ATTESA', 'APPROVATA', 'RIFIUTATA']);
export const richiesteRimborso = pgTable('richieste_rimborso', {
  id: id(),
  prenotazioneId: text('prenotazione_id').notNull().references(() => prenotazioni.id, { onDelete: 'cascade' }),
  motivo: text('motivo'),
  stato: statoRichiestaRimborsoEnum('stato').notNull().default('IN_ATTESA'),
  noteAdmin: text('note_admin'),
  richiestaIl: timestamp('richiesta_il').notNull().defaultNow(),
  gestitaIl: timestamp('gestita_il'),
});

export const layoutBiglietto = pgTable('layout_biglietto', {
  id: id(),
  nome: text('nome').notNull(),
  predefinito: boolean('predefinito').notNull().default(false),
  configurazione: text('configurazione').notNull(),
  creatoIl: timestamp('creato_il').notNull().defaultNow(),
  aggiornatoIl: timestamp('aggiornato_il').notNull().defaultNow(),
});

// Modelli delle email automatiche (conferma, promemoria saldo, biglietto,
// promozione lista d'attesa) — modificabili dal gestionale invece che
// scritti fissi nel codice. "chiave" identifica quale email è (una per
// ogni momento in cui il sistema scrive a un cliente), "oggetto"/"corpo"
// possono contenere segnaposto tipo {{nome}} che vengono sostituiti al
// momento dell'invio.
export const templateEmail = pgTable('template_email', {
  chiave: text('chiave').primaryKey(),
  nome: text('nome').notNull(), // etichetta leggibile nel gestionale, es. "Conferma prenotazione (acconto)"
  oggetto: text('oggetto').notNull(),
  corpo: text('corpo').notNull(),
  aggiornatoIl: timestamp('aggiornato_il').notNull().defaultNow(),
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
  conversazione: one(conversazioniChat, { fields: [messaggiChat.conversazioneId], references: [conversazioniChat.id] }),
}));

export const conversazioniChatRelations = relations(conversazioniChat, ({ one, many }) => ({
  evento: one(eventi, { fields: [conversazioniChat.eventoId], references: [eventi.id] }),
  messaggi: many(messaggiChat),
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
