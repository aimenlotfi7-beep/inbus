/** Sostituisce `alert()` nel gestionale: una notifica in un angolo che
 *  sparisce da sola, invece di una finestra bloccante e non stilizzata
 *  che va chiusa col mouse a ogni azione. Stessa firma a un argomento
 *  di alert(), così ogni chiamata esistente si converte senza toccare
 *  la logica intorno: il TIPO (errore/successo/info) si deduce dal
 *  testo, che nel gestionale è già scritto in modo coerente
 *  ("Salvataggio non riuscito: …", "… salvata.", "Link copiato — …").
 *  Chi vuole essere esplicito passa il secondo argomento. */
/** "urgente" (viola): un preventivo da rifare perché il percorso è cambiato. */
export type TipoNotifica = 'errore' | 'successo' | 'info' | 'urgente';
export interface Notifica { id: number; testo: string; tipo: TipoNotifica }

type Ascoltatore = (n: Notifica) => void;
const ascoltatori = new Set<Ascoltatore>();
let progressivo = 0;

function deduciTipo(testo: string): TipoNotifica {
  const t = testo.toLowerCase();
  if (/non riuscit|impossibile|errore|non valid|non trovat|non puoi|non può|manca|serve |inserisci|compila|aggiungi almeno|prima di|troppo|scadut|superat|blocc/.test(t)) return 'errore';
  if (/salvat|copiat|inviat|completat|aggiornat|fatto|eliminat|creat|approvat|confermat|applicat/.test(t)) return 'successo';
  return 'info';
}

export function notifica(testo: string, tipo?: TipoNotifica) {
  const n: Notifica = { id: ++progressivo, testo, tipo: tipo ?? deduciTipo(testo) };
  if (ascoltatori.size === 0) { window.alert(testo); return; } // nessun <Toaster/> montato (es. pagina fuori dal gestionale): non perdere il messaggio
  for (const a of ascoltatori) a(n);
}

export function ascoltaNotifiche(a: Ascoltatore): () => void {
  ascoltatori.add(a);
  return () => { ascoltatori.delete(a); };
}
