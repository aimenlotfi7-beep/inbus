import { ErroreApi } from './client';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Cache condivisa: se ci sono più pulsanti "Carica file" nella stessa
// pagina (es. immagini evento + intestazione biglietto), il controllo
// va fatto una volta sola, non uno per pulsante.
let statoCache: Promise<boolean> | null = null;

/** Vero se il caricamento file è davvero attivo (R2 configurato su
 *  Railway) — usato per mostrare il pulsante "Carica file" in modo
 *  onesto: disattivato con una spiegazione, invece di sembrare
 *  funzionante e poi fallire solo al click. */
export function verificaCaricamentoAttivo(): Promise<boolean> {
  if (!statoCache) {
    const token = localStorage.getItem('inbus_admin_token');
    statoCache = fetch(`${API_URL}/api/upload/stato`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => res.ok ? res.json() : { attivo: false })
      .then((dati) => dati.attivo === true)
      .catch(() => false);
  }
  return statoCache;
}

/** Carica un file vero (immagine o PDF) e torna il link pubblico dove è
 *  stato salvato — da usare ovunque nel gestionale si salvi un "URL"
 *  (immagini evento, intestazione biglietto, immagini nelle email).
 *  Separato dal client API normale perché un upload multipart non deve
 *  avere Content-Type: application/json (lo imposta da sola il
 *  browser, insieme al "confine" tra i pezzi del file). */
export async function caricaFile(file: File): Promise<string> {
  const token = localStorage.getItem('inbus_admin_token');
  const corpo = new FormData();
  corpo.append('file', file);

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: corpo,
  });

  if (!res.ok) {
    const risposta = await res.json().catch(() => ({ errore: res.statusText }));
    throw new ErroreApi(risposta.errore ?? 'Caricamento non riuscito', res.status);
  }
  const { url } = await res.json();
  return url;
}
