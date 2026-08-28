import { useState } from 'react';

/** Un campo di testo con un pulsante d'azione accanto.
 *  - `link` (per URL veri, es. il link di accesso a una sezione): un
 *    pulsante "Apri ↗" che porta direttamente lì, invece di doverlo
 *    prima copiare e poi incollare altrove.
 *  - senza `link` (per valori che non sono indirizzi navigabili, es.
 *    email o password): resta "Copia" come prima — un alert() del
 *    browser non permette di selezionare/copiare comodamente il testo,
 *    specialmente da telefono. Mostra "Copiato ✓" per un paio di
 *    secondi come conferma visiva. */
export function CampoCopiabile({ etichetta, valore, link }: { etichetta: string; valore: string; link?: boolean }) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(valore);
    } catch {
      // Alcuni browser richiedono un contesto sicuro (https) o un
      // permesso — se fallisce, l'utente può comunque selezionare il
      // testo a mano dal campo qui sotto.
    }
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  return (
    <div className="campo">
      <label>{etichetta}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={valore} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1, fontFamily: "'Space Mono',monospace" }} />
        {link ? (
          <a href={valore} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
            Apri ↗
          </a>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={copia} style={{ whiteSpace: 'nowrap' }}>
            {copiato ? 'Copiato ✓' : 'Copia'}
          </button>
        )}
      </div>
    </div>
  );
}
