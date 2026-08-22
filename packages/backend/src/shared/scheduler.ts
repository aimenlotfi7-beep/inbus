import { prenotazioniService } from '../modules/prenotazioni/prenotazioni.service.js';
import { creditoService } from '../modules/credito/credito.service.js';

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

/** Controlla una volta al giorno se ci sono promemoria saldo da inviare
 *  (prenotazioni ad acconto la cui scadenza è entro le prossime 24 ore),
 *  e se ci sono viaggi ormai conclusi il cui credito fedeltà va ancora
 *  accreditato. Gira dentro lo stesso processo del server: nessun
 *  servizio esterno necessario, ma il controllo si ferma se il server
 *  viene riavviato (riparte comunque al prossimo avvio, quindi nel
 *  peggiore dei casi un promemoria/credito arriva con qualche ora di
 *  ritardo, mai perso). */
export function avviaSchedulerPromemoriaSaldo() {
  async function esegui() {
    try {
      const { inviate } = await prenotazioniService.inviaPromemoriaSaldo();
      if (inviate > 0) console.log(`Promemoria saldo inviati: ${inviate}.`);
    } catch (err) {
      console.error('Errore durante l\'invio dei promemoria saldo:', err);
    }
    try {
      const { maturate } = await creditoService.maturaCreditoViaggiConclusi();
      if (maturate > 0) console.log(`Credito fedeltà maturato per ${maturate} prenotazioni.`);
    } catch (err) {
      console.error('Errore durante la maturazione del credito fedeltà:', err);
    }
  }

  esegui(); // controllo subito all'avvio, poi ogni 24 ore
  setInterval(esegui, UN_GIORNO_MS);
}
