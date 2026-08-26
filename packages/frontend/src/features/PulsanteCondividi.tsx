import { useState } from 'react';

/** Pulsante condividi — usa la vera scheda di condivisione nativa del
 *  telefono quando disponibile (navigator.share, quella con WhatsApp,
 *  Messaggi, ecc. già installati), altrimenti copia semplicemente il
 *  link (desktop, o browser che non la supportano).
 *
 *  soloIcona: per posizionarlo sopra un'immagine (es. la copertina di
 *  un evento) — un cerchietto compatto con la sola icona, senza testo
 *  che occuperebbe spazio in più. */
export function PulsanteCondividi({ titolo, testo, link, etichetta, soloIcona }: { titolo: string; testo: string; link?: string; etichetta?: string; soloIcona?: boolean }) {
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

  const icona = (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" /><line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
    </svg>
  );

  if (soloIcona) {
    return (
      <button
        type="button"
        onClick={condividi}
        title={copiato ? 'Link copiato' : 'Condividi'}
        aria-label="Condividi"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(16,14,28,.65)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,.25)',
          color: '#fff', cursor: 'pointer',
        }}
      >
        {copiato ? '✓' : icona}
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={condividi} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {copiato ? '✓ Link copiato' : (etichetta ?? '↗ Condividi')}
    </button>
  );
}
