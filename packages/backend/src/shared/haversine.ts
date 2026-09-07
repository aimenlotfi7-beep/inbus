// Solo matematica, nessun import: importabile dai test senza tirare
// dentro la connessione al database (distanza.ts, che la usa, importa
// db/client e in un test farebbe fallire la validazione dell'ambiente).
/** Distanza in linea d'aria tra due punti (km) — stessa formula usata
 *  per il raggio dei fornitori (shared/geo lato frontend, replicata
 *  qui lato server perché serve senza passare da una chiamata HTTP). */
export function distanzaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
