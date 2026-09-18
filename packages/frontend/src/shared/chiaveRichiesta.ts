/**
 * La chiave di un tentativo di acquisto (controllo della logica, settembre
 * 2026): va al server con la prenotazione o l'ordine, e se la stessa
 * richiesta arriva due volte (doppio clic, rete lenta che ripete, due
 * schede) il server restituisce la prenotazione già fatta invece di
 * crearne un'altra (packages/backend/src/shared/idempotenza.ts).
 *
 * Stessi dati = stessa chiave, finché l'acquisto non va a buon fine; dati
 * cambiati (altra fermata, altri passeggeri…) = chiave nuova, perché è una
 * richiesta diversa. Dopo un acquisto riuscito si dimentica: il prossimo è
 * un acquisto nuovo.
 */

function nuovaChiave(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const byte = new Uint8Array(16);
  c.getRandomValues(byte);
  return Array.from(byte, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function creaChiaviRichiesta() {
  let ultimaFirma = '';
  let chiave = '';
  return {
    /** La chiave per questi dati (senza quelli che cambiano a ogni clic, come l'id per Meta). */
    per(dati: unknown): string {
      const firma = JSON.stringify(dati);
      if (firma !== ultimaFirma || !chiave) {
        ultimaFirma = firma;
        chiave = nuovaChiave();
      }
      return chiave;
    },
    /** Acquisto riuscito: il prossimo avrà una chiave nuova. */
    dimentica() {
      ultimaFirma = '';
      chiave = '';
    },
  };
}
