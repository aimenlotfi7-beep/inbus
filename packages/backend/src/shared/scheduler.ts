import { prenotazioniService } from '../modules/prenotazioni/prenotazioni.service.js';
import { creditoService } from '../modules/credito/credito.service.js';
import { disattivaFermatePartenzaSottoSoglia } from '../modules/variazioni/variazioni.service.js';

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;
const UN_ORA_MS = 60 * 60 * 1000;

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

/** Controlla ogni ora se ci sono prenotazioni da assegnare a un bus
 *  (riordino per fasce d'età) — più frequente del controllo giornaliero
 *  sopra perché il momento in cui una partenza "entra" nelle prossime
 *  24 ore è preciso: un controllo solo giornaliero potrebbe far
 *  aspettare un cliente fino al giorno dopo prima di poter scaricare
 *  il biglietto, anche se la soglia delle 24 ore è già scattata da
 *  ore. Gestisce anche prenotazioni arrivate DOPO il primo riordino di
 *  quella fermata (restano senza bus finché non passa di nuovo — entro
 *  un'ora al massimo). */
export function avviaSchedulerRiordinoEta() {
  async function esegui() {
    // Prima le soglie (una fermata che non ce l'ha fatta va disattivata
    // e comunicata PRIMA di calcolare il riordino per età — altrimenti
    // rischierei di assegnare posti su una fermata che sta per sparire).
    try {
      const { disattivate } = await disattivaFermatePartenzaSottoSoglia();
      if (disattivate > 0) console.log(`Fermate "Partenza" disattivate per soglia non raggiunta: ${disattivate}.`);
    } catch (err) {
      console.error('Errore durante il controllo soglia minima fermate:', err);
    }
    try {
      const { riordinate } = await prenotazioniService.riordinaPerFasceEta();
      if (riordinate > 0) console.log(`Prenotazioni riordinate per fascia d'età e assegnate a un bus: ${riordinate}.`);
    } catch (err) {
      console.error('Errore durante il riordino per fasce d\'età:', err);
    }
  }

  esegui();
  setInterval(esegui, UN_ORA_MS);
}
