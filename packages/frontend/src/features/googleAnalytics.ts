// Google Analytics 4 — comportamento dei visitatori (da dove arrivano,
// quanto restano, dove abbandonano), diverso dal Pixel di Meta (che
// serve a Meta per ottimizzare le SUE campagne). Stesso schema del
// Pixel: parte solo con il consenso "marketing", stesso banner cookie.
//
// UTM: GA4 li legge DA SOLO dall'URL di atterraggio, senza bisogno di
// programmarlo — a differenza del Pixel, qui non c'è nulla da leggere
// o passare a mano per l'attribuzione della fonte.
//
// SPA: gtag NON traccia da solo i cambi pagina di un'app React (nessun
// vero ricaricamento) — send_page_view è disattivato in init, ogni
// pagina si traccia a mano (vedi tracciaPageViewGA4, chiamata da
// Layout a ogni cambio di rotta).

import { haConsensoPer } from './CookieBanner';
import { impostazioniApi } from '../api/impostazioni';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let ga4IdCache: string | null | undefined; // undefined = non ancora chiesto al server
let caricato = false;

function caricaScript(id: string) {
  if (caricato || window.gtag) return;
  caricato = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  // send_page_view: false — vedi nota SPA sopra, tracciamo noi ogni pagina a mano.
  window.gtag('config', id, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);
}

/** Da chiamare una volta, in Layout — stesso meccanismo del Pixel:
 *  prova a caricare se il consenso c'è già, resta in ascolto per
 *  quando arriva dopo. */
export function inizializzaGA4() {
  async function provaACaricare() {
    if (!haConsensoPer('marketing')) return;
    if (ga4IdCache === undefined) {
      try {
        const { ga4Id } = await impostazioniApi.tracciamentoPubblico();
        ga4IdCache = ga4Id;
      } catch {
        ga4IdCache = null;
      }
    }
    if (ga4IdCache) caricaScript(ga4IdCache);
  }
  provaACaricare();
  window.addEventListener('inbus-consenso-cookie-cambiato', provaACaricare);
}

/** Per la pagina del WIDGET — stesso gap noto e accettato del Pixel
 *  (vedi inizializzaMetaPixelWidget in metaPixel.ts): nessun banner
 *  cookie lì, quindi qui NON si controlla haConsensoPer(). */
export async function inizializzaGA4Widget() {
  if (ga4IdCache === undefined) {
    try {
      const { ga4Id } = await impostazioniApi.tracciamentoPubblico();
      ga4IdCache = ga4Id;
    } catch {
      ga4IdCache = null;
    }
  }
  if (ga4IdCache) caricaScript(ga4IdCache);
}

/** Una pagina vista — chiamala a ogni cambio di rotta (vedi Layout,
 *  useLocation). Se GA4 non è ancora caricato (consenso non dato),
 *  non fa nulla. */
export function tracciaPaginaGA4(percorso: string, titolo?: string) {
  if (!window.gtag) return;
  window.gtag('event', 'page_view', { page_path: percorso, page_title: titolo, page_location: window.location.href });
}

/** Il cliente ha scelto una fermata — equivalente GA4 di
 *  InitiateCheckout, stesso momento del Pixel. */
export function tracciaInizioCheckoutGA4(valore: number, nomeEvento?: string) {
  if (!window.gtag) return;
  window.gtag('event', 'begin_checkout', {
    currency: 'EUR', value: valore,
    ...(nomeEvento && { items: [{ item_name: nomeEvento }] }),
  });
}

/** Acquisto confermato — transactionId (il PNR, o l'id ordine per un
 *  bundle) evita che GA4 conti due volte lo stesso acquisto se
 *  l'evento viene per qualche motivo rilanciato. */
export function tracciaAcquistoGA4(valore: number, transactionId: string, nomeEvento?: string) {
  if (!window.gtag) return;
  window.gtag('event', 'purchase', {
    transaction_id: transactionId, currency: 'EUR', value: valore,
    ...(nomeEvento && { items: [{ item_name: nomeEvento }] }),
  });
}
