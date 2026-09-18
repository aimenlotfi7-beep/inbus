import { useEffect, useState } from 'react';
import type { WhiteLabelTheme } from '../../api/whiteLabel';
import { consensoGiaScelto, riapriSceltaCookie, salvaConsenso } from '../CookieBanner';
import { stilePulsante, stileRiquadro } from './tema';

/** La richiesta di consenso ai cookie nella pagina White Label (link
 *  /w/…): con la grafica del cliente e senza il nome OnWay, come il resto
 *  della pagina. Senza una scelta, il Pixel di Meta e Google Analytics
 *  non partono (metaPixel.ts, googleAnalytics.ts): prima partivano
 *  sempre, e per il GDPR non si può. La scelta è la stessa del sito
 *  (stessa memoria del browser) e si cambia dal link "Preferenze
 *  cookie" che resta in fondo alla pagina. */
export function ConsensoWidget({ tema }: { tema: WhiteLabelTheme }) {
  const [scelto, setScelto] = useState(consensoGiaScelto);

  useEffect(() => {
    const aggiorna = () => setScelto(consensoGiaScelto());
    window.addEventListener('inbus-consenso-cookie-cambiato', aggiorna);
    return () => window.removeEventListener('inbus-consenso-cookie-cambiato', aggiorna);
  }, []);

  const testoPiccolo = { fontSize: tema.tipografia.dimensioneTestoPx * 0.8, color: tema.colori.testoSecondario };

  if (scelto) {
    return (
      <button
        type="button"
        onClick={riapriSceltaCookie}
        style={{ display: 'block', margin: '10px auto 0', padding: 0, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', ...testoPiccolo }}
      >
        Preferenze cookie
      </button>
    );
  }

  const tutti = (si: boolean) => salvaConsenso({ preferenze: si, statistiche: si, marketing: si });
  return (
    <div role="region" aria-label="Consenso ai cookie" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 50, display: 'flex', justifyContent: 'center' }}>
      <div style={{ ...stileRiquadro(tema), width: '100%', maxWidth: 560, boxShadow: '0 10px 30px rgba(0,0,0,.28)' }}>
        <p style={{ margin: '0 0 10px', fontSize: tema.tipografia.dimensioneTestoPx * 0.9, lineHeight: 1.5 }}>
          Usiamo cookie tecnici per far funzionare la pagina. Con il tuo consenso usiamo anche cookie di statistica e
          marketing, per misurare le visite e le campagne.{' '}
          <a href="/pagina/cookie" target="_blank" rel="noopener" style={{ color: 'inherit' }}>Informativa cookie</a>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => tutti(false)} style={{ ...stilePulsante(tema, 'secondario'), flex: 1 }}>Rifiuta</button>
          <button type="button" onClick={() => tutti(true)} style={{ ...stilePulsante(tema), flex: 1 }}>Accetta</button>
        </div>
      </div>
    </div>
  );
}
