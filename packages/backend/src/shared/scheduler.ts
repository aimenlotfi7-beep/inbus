import { prenotazioniService } from '../modules/prenotazioni/prenotazioni.service.js';

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

/** Controlla una volta al giorno se ci sono promemoria saldo da inviare
 *  (prenotazioni ad acconto la cui scadenza è entro le prossime 24 ore).
 *  Gira dentro lo stesso processo del server: nessun servizio esterno
 *  necessario, ma il controllo si ferma se il server viene riavviato
 *  (riparte comunque al prossimo avvio, quindi nel peggiore dei casi un
 *  promemoria arriva con qualche ora di ritardo, mai perso). */
export function avviaSchedulerPromemoriaSaldo() {
  async function esegui() {
    try {
      const { inviate } = await prenotazioniService.inviaPromemoriaSaldo();
      if (inviate > 0) console.log(`Promemoria saldo inviati: ${inviate}.`);
    } catch (err) {
      console.error('Errore durante l\'invio dei promemoria saldo:', err);
    }
  }

  esegui(); // controllo subito all'avvio, poi ogni 24 ore
  setInterval(esegui, UN_GIORNO_MS);
}
