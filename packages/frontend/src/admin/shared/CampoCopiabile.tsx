import { useState } from 'react';

/** Un campo di testo con un pulsante "Copia" vero — un alert() del
 *  browser non permette di selezionare/copiare comodamente il testo,
 *  specialmente da telefono. Mostra "Copiato ✓" per un paio di secondi
 *  come conferma visiva. */
export function CampoCopiabile({ etichetta, valore }: { etichetta: string; valore: string }) {
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
        <button type="button" className="btn btn-ghost" onClick={copia} style={{ whiteSpace: 'nowrap' }}>
          {copiato ? 'Copiato ✓' : 'Copia'}
        </button>
      </div>
    </div>
  );
}
