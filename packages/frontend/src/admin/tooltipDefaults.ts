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
  descrizione_evento: 'Visibile ai clienti sulla pagina, e usata anche per Google/social.',
  immagine_intestazione: 'Facoltativa.',
  visibile_sito: 'Se lo disattivi, l\'evento non compare mai sul sito (anche se è nel futuro). Gli eventi con data già passata comunque non compaiono più sul sito, a prescindere da questo interruttore.',
  variazioni_intro: 'Cambi di città/indirizzo/orario su fermate già vendute, e come i clienti toccati hanno risposto.',
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
};
