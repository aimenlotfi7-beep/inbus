import { prenotazioniService } from '../modules/prenotazioni/prenotazioni.service.js';
import { smistamentoService } from '../modules/prenotazioni/smistamento.service.js';
import { lineeDaConfermareService } from '../modules/eventi/linee-da-confermare.service.js';
import { creditoService } from '../modules/credito/credito.service.js';
import { disattivaFermateSottoSoglia } from '../modules/variazioni/variazioni.service.js';

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

/** Ogni ora (e all'avvio): le linee da confermare (vedi
 *  linee-da-confermare.service.ts) e lo smistamento dei passeggeri sui bus
 *  per età (vedi smistamento.service.ts). Ogni ora e non una volta al giorno
 *  perché il momento in cui una partenza "entra" nelle 24 ore è preciso: da
 *  lì parte il biglietto con il bus. Prende anche le prenotazioni arrivate
 *  dopo il primo giro (restano senza bus al massimo un'ora). Linee e
 *  smistamento partono anche subito dopo prenotazioni e modifiche ai bus:
 *  questo giro è la rete di sicurezza (es. soglia di pareggio cambiata). */
export function avviaSchedulerRiordinoEta() {
  async function esegui() {
    // Prima le soglie (una fermata che non ce l'ha fatta va disattivata
    // e comunicata PRIMA dello smistamento — altrimenti si rischierebbe
    // di assegnare posti su una fermata che sta per sparire).
    try {
      const { disattivate } = await disattivaFermateSottoSoglia();
      if (disattivate > 0) console.log(`Fermate "Partenza" disattivate per soglia non raggiunta: ${disattivate}.`);
    } catch (err) {
      console.error('Errore durante il controllo soglia minima fermate:', err);
    }
    try {
      const { create, tolte } = await lineeDaConfermareService.allineaTutte();
      if (create > 0 || tolte > 0) console.log(`Linee da confermare: ${create} create, ${tolte} tolte.`);
    } catch (err) {
      console.error('Errore durante l\'aggiornamento delle linee da confermare:', err);
    }
    try {
      const { assegnate, senzaPosto } = await smistamentoService.esegui();
      if (assegnate > 0) console.log(`Smistamento sui bus: ${assegnate} prenotazioni assegnate a un bus.`);
      if (senzaPosto > 0) console.warn(`Smistamento sui bus: ${senzaPosto} prenotazioni restano senza bus (dettagli nelle righe [smistamento] qui sopra).`);
    } catch (err) {
      console.error('Errore durante lo smistamento sui bus:', err);
    }
  }

  esegui();
  setInterval(esegui, UN_ORA_MS);
}
