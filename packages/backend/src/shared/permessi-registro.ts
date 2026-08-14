// Elenco centrale di tutti i permessi disponibili nell'app.
//
// Aggiungere una riga qui = al prossimo deploy la funzione compare da sola
// nella pagina "Ruoli" del gestionale, pronta da assegnare (vedi
// permessi-sync.ts, chiamato all'avvio del server).
// Togliere una riga = al prossimo deploy sparisce dall'elenco (i ruoli che
// la avevano assegnata non si rompono: il permesso viene solo ignorato).
//
// Alcune voci qui sotto (contrassegnate "solo UI") non proteggono un
// endpoint dedicato: filtrano solo la visibilità di una sezione del menu
// del gestionale che usa le API di un altro modulo (es. "Vetrina" e
// "Calendario" leggono/scrivono sulle stesse API di "Eventi").

export interface DefinizionePermesso {
  chiave: string;
  etichetta: string;
  modulo: string;
}

export const REGISTRO_PERMESSI: DefinizionePermesso[] = [
  // Eventi
  { chiave: 'eventi.visualizza', etichetta: 'Visualizzare eventi', modulo: 'Eventi' },
  { chiave: 'eventi.crea', etichetta: 'Creare/modificare eventi', modulo: 'Eventi' },
  { chiave: 'eventi.elimina', etichetta: 'Eliminare eventi', modulo: 'Eventi' },
  { chiave: 'eventi.vetrina', etichetta: 'Gestire la Vetrina (eventi in evidenza)', modulo: 'Eventi' }, // solo UI
  { chiave: 'eventi.calendario', etichetta: 'Visualizzare il Calendario eventi', modulo: 'Eventi' }, // solo UI
  { chiave: 'eventi.cestino', etichetta: 'Accedere al Cestino eventi eliminati', modulo: 'Eventi' }, // solo UI

  // Prenotazioni
  { chiave: 'prenotazioni.visualizza', etichetta: 'Visualizzare prenotazioni', modulo: 'Prenotazioni' },
  { chiave: 'prenotazioni.gestisci', etichetta: 'Creare/modificare prenotazioni', modulo: 'Prenotazioni' },
  { chiave: 'prenotazioni.cancella', etichetta: 'Cancellare prenotazioni', modulo: 'Prenotazioni' },
  { chiave: 'prenotazioni.rimborsa', etichetta: 'Gestire rimborsi', modulo: 'Prenotazioni' },
  { chiave: 'prenotazioni.transazioni', etichetta: 'Visualizzare le Transazioni', modulo: 'Prenotazioni' }, // solo UI
  { chiave: 'prenotazioni.pagamenti', etichetta: 'Gestire i Pagamenti', modulo: 'Prenotazioni' }, // solo UI

  // Utenti (clienti)
  { chiave: 'utenti.visualizza', etichetta: 'Visualizzare utenti', modulo: 'Utenti' },

  // Coupon
  { chiave: 'coupon.visualizza', etichetta: 'Visualizzare coupon', modulo: 'Coupon' },
  { chiave: 'coupon.gestisci', etichetta: 'Creare/modificare/eliminare coupon', modulo: 'Coupon' },

  // Fornitori
  { chiave: 'fornitori.visualizza', etichetta: 'Visualizzare fornitori', modulo: 'Fornitori' },
  { chiave: 'fornitori.gestisci', etichetta: 'Creare/modificare fornitori', modulo: 'Fornitori' },
  { chiave: 'fornitori.elimina', etichetta: 'Eliminare fornitori', modulo: 'Fornitori' },

  // Tragitti
  { chiave: 'tragitti.visualizza', etichetta: 'Visualizzare tragitti', modulo: 'Tragitti' },
  { chiave: 'tragitti.gestisci', etichetta: 'Creare/modificare/eliminare tragitti', modulo: 'Tragitti' },

  // Promoter
  { chiave: 'promoter.visualizza', etichetta: 'Visualizzare promoter', modulo: 'Promoter' },
  { chiave: 'promoter.gestisci', etichetta: 'Creare/modificare/eliminare promoter', modulo: 'Promoter' },

  // Tour leader
  { chiave: 'tourleader.visualizza', etichetta: 'Visualizzare candidature tour leader', modulo: 'Tour Leader' },
  { chiave: 'tourleader.gestisci', etichetta: 'Modificare/eliminare tour leader', modulo: 'Tour Leader' },

  // Chat
  { chiave: 'chat.visualizza', etichetta: 'Visualizzare le chat', modulo: 'Chat' },
  { chiave: 'chat.rispondi', etichetta: 'Rispondere e segnare come lette', modulo: 'Chat' },

  // Contenuti sito
  { chiave: 'pagine.gestisci', etichetta: 'Modificare pagine e contenuti del sito', modulo: 'Contenuti sito' },

  // Statistiche
  { chiave: 'statistiche.visualizza', etichetta: 'Visualizzare le statistiche', modulo: 'Statistiche' },

  // Amministrazione del gestionale stesso
  { chiave: 'utenze.crea', etichetta: 'Creare nuove utenze del gestionale', modulo: 'Amministrazione' },
  { chiave: 'utenze.gestisci', etichetta: 'Modificare/disattivare/eliminare utenze esistenti', modulo: 'Amministrazione' },
  { chiave: 'permessi.gestisci', etichetta: 'Definire ruoli e le relative autorizzazioni', modulo: 'Amministrazione' },
];
