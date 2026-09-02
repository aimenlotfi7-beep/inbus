/** Testi di default per tutti i tooltip della scheda evento — se un
 *  admin ne personalizza uno dalla sezione Sistema → Testi tooltip,
 *  quello scritto lì sostituisce il default qui sotto (stesso sistema
 *  già usato per i testi configurabili della homepage: la tabella
 *  "contenuti", chiave prefissata "tooltip_" per non confondersi con
 *  gli altri contenuti del sito). Se non è mai stato personalizzato,
 *  si vede semplicemente questo testo qui.
 *
 *  Un'unica lista, così sia la scheda evento che la schermata di
 *  modifica in Sistema partono dagli stessi identici valori — nessuna
 *  duplicazione tra "cosa mostro" e "cosa posso modificare". */
export const TOOLTIP_DEFAULT: Record<string, string> = {
  categoria: 'I pulsanti in alto sul sito.',
  url: 'Facoltativo — se lo lasci vuoto, si genera da solo.',
  avviso_disponibilita: 'Mostrato ai clienti al posto dei posti reali. Lasciandolo su "Automatico", il sito mostra da solo "Pochi posti" (sotto il 20% rimasto) o "Posti terminati" quando serve, senza che tu debba pensarci — scegli una delle altre opzioni solo se vuoi forzarla tu (es. per una promozione), a prescindere dai numeri reali.',
  tragitti: 'Facoltativi — puoi aggiungerli anche dopo. Qui censisci solo il nome e la sequenza di fermate: orario, prezzo, posti e il primo bus si confermano poi in Partenze, non qui — un tragitto non è in vendita finché non lo confermi lì.',
  informazioni_viaggio: 'Mostrate sulla pagina dell\'evento, sotto la foto.',
  descrizione_evento: 'Visibile ai clienti sulla pagina, e usata anche per Google/social. Diversa dalle "Informazioni viaggio" sopra: questa è un testo più discorsivo su evento/artista, quella sopra è pratica (ritrovo, regole del bus, ecc.).',
  immagine_intestazione: 'Facoltativa — compare come fascia in cima al biglietto (larga quanto la pagina, ritagliata automaticamente).',
  visibile_sito: 'Se lo disattivi, l\'evento non compare mai sul sito (anche se è nel futuro). Gli eventi con data già passata comunque non compaiono più sul sito, a prescindere da questo interruttore.',
  variazioni_intro: 'Cambi di città/indirizzo/orario su fermate già vendute, e come i clienti toccati hanno risposto.',
  cestino_intro: 'Niente viene mai cancellato per davvero — se ha prenotazioni collegate, andrebbero perse. Qui trovi tutto quello che hai eliminato, sempre recuperabile.',
  fermate_intro: 'L\'anagrafica dei luoghi fisici — si scelgono da qui componendo i tragitti di un evento, invece di riscrivere ogni volta città e indirizzo.',
  ruoli_intro: 'Puoi creare ruoli con il nome che preferisci e scegliere esattamente cosa può fare chi lo ha. Puoi assegnare solo i permessi che possiedi tu stesso.',
  comunicazioni_intro: 'Scegli l\'evento per cui vuoi scrivere ai clienti — poi filtri per servizio, tratta o fermata specifica.',
  layout_biglietto_intro: 'Trascina ogni sezione dove vuoi sul biglietto; trascina l\'angolo in basso a destra per ridimensionarla — mentre trascini, delle linee rosa ti avvisano quando ti allinei con un altro elemento o con centro/bordi della pagina, e ci si "aggancia" da sole per allineamenti sempre precisi. Ogni evento usa il layout predefinito a meno che, dalla sua scheda, tu non ne scelga uno diverso.',
  template_email_intro: 'Modifica il testo che i clienti ricevono via email. I segnaposto tra doppie graffe (es. {{nome}}) vengono sostituiti automaticamente con il dato vero al momento dell\'invio — non toglierli, altrimenti quel punto resterebbe vuoto.',
  white_label_intro: 'Ogni riga collega un organizzatore a UN suo evento specifico — il widget che riceve serve solo a vendere il viaggio di quell\'evento, mai altro.',
  offerte_intro: 'Crea un link con uno sconto percentuale dedicato per una campagna pubblicitaria (es. "-20%" per chi arriva da Meta) — si applica al prezzo normale di qualunque fermata scelga il cliente. Il link pubblico porta solo un nome, mai lo sconto: non è modificabile dal browser.',
  tourleader_censisci_intro: 'Registra qui direttamente un tour leader che conosci già — non deve passare dal modulo pubblico di autocandidatura. Parte come "Attivo", puoi cambiare stato in qualsiasi momento dall\'elenco.',
  permessi_personali_intro: 'Clicca un permesso per aggiungerlo o toglierlo solo per questa persona, indipendentemente dal ruolo. Puoi togliere qualsiasi permesso, ma puoi concederne in più solo tra quelli che possiedi tu stesso.',
  partenze_intro: 'Ogni card è un evento — se ha più servizi o percorsi, si aprono dentro.',
  preventivi_intro: 'Calcola gli orari e registra i preventivi dei fornitori — ogni card è un evento.',
  preventivo_form_intro: 'Una stima dal fornitore (non un bus vero ancora opzionato) sullo scenario più caro — sblocca la vendita, coi prezzi calcolati per fermata. Se poi costruisci una Linea più economica, il margine extra resta un guadagno in più.',
  layout_biglietto_campo: 'Composizione grafica del PDF (ordine sezioni, posizione QR) — si gestiscono da Marketing → Layout biglietto.',
  immagini_evento_intro: 'Carica un\'immagine, oppure incolla il link se è già online da qualche parte — vengono mostrate nella galleria della pagina evento sul sito.',
  biglietto_grafica_intro: 'Grafica del biglietto digitale — facoltativa, se non la imposti il PDF (con QR) usa l\'aspetto di base.',
  fermata_nome_campo: 'es. "Milano Lambrate", non solo "Milano".',
  fermata_link_campo: 'Facoltativo — es. Google Maps, punto di ritrovo.',
  fermate_orario_intro: 'Posti, prezzi e orari delle fermate si impostano da Partenze, una volta che questo tragitto è confermato lì con un bus vero — usano l\'arrivo indicato qui sopra come riferimento per calcolarli.',
};

/** Etichette leggibili per la schermata di modifica in Sistema — non
 *  serve che l'admin capisca la chiave tecnica ("avviso_disponibilita"),
 *  gli si mostra questa invece. */
export const TOOLTIP_ETICHETTA: Record<string, string> = {
  categoria: 'Categoria (scheda evento)',
  url: 'URL (scheda evento)',
  avviso_disponibilita: 'Avviso disponibilità (scheda evento)',
  tragitti: 'Tragitti (scheda evento)',
  informazioni_viaggio: 'Informazioni viaggio (scheda evento)',
  descrizione_evento: 'Descrizione evento (scheda evento)',
  immagine_intestazione: 'Immagine di intestazione (scheda evento)',
  visibile_sito: 'Visibile sul sito (scheda evento)',
  variazioni_intro: 'Introduzione (sezione Variazioni)',
  cestino_intro: 'Introduzione (sezione Cestino)',
  fermate_intro: 'Introduzione (sezione Fermate)',
  ruoli_intro: 'Introduzione (sezione Ruoli)',
  comunicazioni_intro: 'Introduzione (sezione Comunicazioni)',
  layout_biglietto_intro: 'Introduzione (sezione Layout biglietto)',
  template_email_intro: 'Introduzione (sezione Testo email)',
  white_label_intro: 'Introduzione (sezione White Label)',
  offerte_intro: 'Introduzione (tab Offerte, dentro un evento)',
  tourleader_censisci_intro: 'Introduzione (modulo "Censisci tour leader")',
  permessi_personali_intro: 'Introduzione (modulo "Permessi personali", dentro Amministratori)',
  partenze_intro: 'Introduzione (sezione Partenze)',
  preventivi_intro: 'Introduzione (sezione Preventivi)',
  preventivo_form_intro: 'Introduzione (modulo preventivo, dentro un tragitto)',
  layout_biglietto_campo: 'Layout del biglietto (scheda evento)',
  immagini_evento_intro: 'Introduzione (tab Immagini, scheda evento)',
  biglietto_grafica_intro: 'Introduzione (tab Biglietto, scheda evento)',
  fermata_nome_campo: 'Nome (sezione Fermate)',
  fermata_link_campo: 'Link (sezione Fermate)',
  fermate_orario_intro: 'Introduzione (elenco fermate, scheda evento)',
};
