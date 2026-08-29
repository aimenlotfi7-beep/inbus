import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const CHIAVE_CONSENSO = 'inbus_consenso_cookie';
type Consenso = 'accettato' | 'solo-necessari';

/** Vero solo se l'utente ha scelto "Accetta tutti" — usalo per decidere
 *  se caricare script di terze parti che leggono/scrivono cookie non
 *  strettamente necessari (es. Google Analytics, Meta Pixel), quando
 *  li aggiungerai. Esempio:
 *    if (haAccettatoCookieNonNecessari()) { /* carica gtag/fbq qui *\/ }
 */
export function haAccettatoCookieNonNecessari(): boolean {
  return localStorage.getItem(CHIAVE_CONSENSO) === 'accettato';
}

function salvaConsenso(valore: Consenso) {
  localStorage.setItem(CHIAVE_CONSENSO, valore);
  window.dispatchEvent(new Event('inbus-consenso-cookie-cambiato'));
}

/**
 * Banner di consenso cookie (obbligatorio per legge in UE/Italia se il
 * sito usa cookie non strettamente necessari). Oggi il sito non ne usa
 * ancora (nessun Google Analytics/Meta Pixel installato) — il banner è
 * comunque pronto: se in futuro aggiungi tracciamento, fallo partire
 * solo dopo aver controllato haAccettatoCookieNonNecessari().
 *
 * Il pulsante "Preferenze cookie" nel footer permette di riaprirlo e
 * cambiare scelta in qualsiasi momento (obbligatorio, non basta
 * chiederlo una volta sola all'inizio).
 */
export function CookieBanner() {
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    function aggiornaVisibilita() {
      setVisibile(!localStorage.getItem(CHIAVE_CONSENSO));
    }
    aggiornaVisibilita();
    // Si riapre anche se l'utente clicca "Preferenze cookie" nel footer,
    // che cancella la scelta precedente e lancia questo evento.
    window.addEventListener('inbus-consenso-cookie-cambiato', aggiornaVisibilita);
    return () => window.removeEventListener('inbus-consenso-cookie-cambiato', aggiornaVisibilita);
  }, []);

  if (!visibile) return null;

  return (
    <div className="cookie-banner">
      <p>
        Usiamo cookie tecnici necessari al funzionamento del sito. Con il tuo consenso potremmo usarne altri per
        statistiche e marketing — leggi la <Link to="/pagina/cookie">informativa cookie</Link> per i dettagli.
      </p>
      <div className="cookie-banner-azioni">
        <button className="btn btn-ghost" onClick={() => { salvaConsenso('solo-necessari'); setVisibile(false); }}>Solo necessari</button>
        <button className="btn btn-primary" onClick={() => { salvaConsenso('accettato'); setVisibile(false); }}>Accetta tutti</button>
      </div>
    </div>
  );
}

/** Link da mettere nel footer: riapre il banner per cambiare scelta. */
export function LinkPreferenzeCookie() {
  return (
    <button
      type="button"
      className="link-preferenze-cookie"
      onClick={() => { localStorage.removeItem(CHIAVE_CONSENSO); window.dispatchEvent(new Event('inbus-consenso-cookie-cambiato')); }}
    >
      Preferenze cookie
    </button>
  );
}
