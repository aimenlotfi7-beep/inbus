import { useState } from 'react';

/** Pulsante condividi — usa la vera scheda di condivisione nativa del
 *  telefono quando disponibile (navigator.share, quella con WhatsApp,
 *  Messaggi, ecc. già installati), altrimenti copia semplicemente il
 *  link (desktop, o browser che non la supportano). */
export function PulsanteCondividi({ titolo, testo, link, etichetta }: { titolo: string; testo: string; link?: string; etichetta?: string }) {
  const [copiato, setCopiato] = useState(false);
  const url = link ?? window.location.href;

  async function condividi() {
    if (navigator.share) {
      try {
        await navigator.share({ title: titolo, text: testo, url });
      } catch {
        // L'utente ha semplicemente annullato la scheda di condivisione — non è un errore da segnalare.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2200);
    } catch {
      // Se anche la copia fallisce (rarissimo), non c'è molto altro da offrire qui.
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={condividi} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {copiato ? '✓ Link copiato' : (etichetta ?? '↗ Condividi')}
    </button>
  );
}
