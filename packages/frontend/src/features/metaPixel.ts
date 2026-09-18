// Pixel di Meta — carica lo script SOLO se il cliente ha dato il
// consenso "marketing" (vedi CookieBanner.tsx, gia' pensato apposta
// per questo). Se non ha ancora scelto, o ha rifiutato, il Pixel non
// parte: nessun evento, nessun cookie di tracciamento — obbligatorio
// per il GDPR, non facoltativo.
//
// PageView si traccia da solo, una volta caricato. Gli eventi
// personalizzati (InitiateCheckout, Purchase) si chiamano dal punto
// esatto del codice dove l'azione avviene davvero (vedi SelettoreFermata,
// CheckoutForm, CarrelloPage) — mai da un posto centrale.

import { haConsensoPer } from './CookieBanner';
import { impostazioniApi } from '../api/impostazioni';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

let pixelIdCache: string | null | undefined; // undefined = non ancora chiesto al server
let scriptCaricato = false;
const pixelGiaInizializzati = new Set<string>();

/** Carica lo script base UNA volta (idempotente) — non inizializza
 *  nessun pixel da sola, lo fanno le due funzioni sotto. */
function caricaScriptBase() {
  if (scriptCaricato || window.fbq) { scriptCaricato = true; return; }
  scriptCaricato = true;
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any) {
    let n: any, t: any, s: any;
    if (f.fbq) return;
    n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
}

function inizializzaPixel(pixelId: string) {
  caricaScriptBase();
  if (pixelGiaInizializzati.has(pixelId)) return;
  pixelGiaInizializzati.add(pixelId);
  window.fbq!('init', pixelId);
}

/** Da chiamare una volta, in Layout (sito principale) — prova a
 *  caricare il Pixel DI INBUS se il consenso "marketing" c'è già, e
 *  resta in ascolto per quando arriva dopo (l'utente accetta i cookie
 *  DOPO essere atterrato sul sito). */
export function inizializzaMetaPixel() {
  async function provaACaricare() {
    if (!haConsensoPer('marketing')) return;
    if (pixelIdCache === undefined) {
      try {
        const { pixelId } = await impostazioniApi.metaPixelIdPubblico();
        pixelIdCache = pixelId;
      } catch {
        pixelIdCache = null;
      }
    }
    if (pixelIdCache) { inizializzaPixel(pixelIdCache); window.fbq!('track', 'PageView'); }
  }
  provaACaricare();
  window.addEventListener('inbus-consenso-cookie-cambiato', provaACaricare);
}

/** Per la pagina del WIDGET (White Label) — inizializza IL PIXEL DI
 *  INBUS e, se l'organizzatore ne ha impostato uno suo, ANCHE quello:
 *  fbq('track', ...) manda l'evento a tutti i pixel inizializzati,
 *  quindi le funzioni tracciaInizioPrenotazione/tracciaAcquisto qui
 *  sotto non cambiano, arrivano a entrambi da sole.
 *
 *  Come sul sito: solo con il consenso "marketing", chiesto dal banner
 *  con la grafica del cliente (ConsensoWidget in WidgetPubblicoPage), e
 *  appena arriva se il cliente lo dà dopo. */
export function inizializzaMetaPixelWidget(pixelIdOrganizzatore: string | null) {
  async function provaACaricare() {
    if (!haConsensoPer('marketing')) return;
    if (pixelIdCache === undefined) {
      try {
        const { pixelId } = await impostazioniApi.metaPixelIdPubblico();
        pixelIdCache = pixelId;
      } catch {
        pixelIdCache = null;
      }
    }
    if (pixelIdCache) inizializzaPixel(pixelIdCache);
    if (pixelIdOrganizzatore) inizializzaPixel(pixelIdOrganizzatore);
    if (pixelIdCache || pixelIdOrganizzatore) window.fbq?.('track', 'PageView');
  }
  provaACaricare();
  window.addEventListener('inbus-consenso-cookie-cambiato', provaACaricare);
}

/** Il cliente ha scelto una fermata — segnale di inizio prenotazione,
 *  utile per capire dove le persone abbandonano prima di pagare.
 *
 *  Il controllo è "il pixel è stato caricato" (window.fbq esiste), non
 *  di nuovo haConsensoPer(): fbq esiste SOLO se il consenso c'è già
 *  (inizializzaMetaPixel e inizializzaMetaPixelWidget lo garantiscono). */
export function tracciaInizioPrenotazione(valore: number) {
  if (!window.fbq) return;
  window.fbq('track', 'InitiateCheckout', { value: valore, currency: 'EUR' });
}

/** Acquisto confermato — eventId condiviso con la Conversions API lato
 *  server (stesso valore mandato nel payload dell'ordine), cosi'
 *  Meta deduplica invece di contare l'evento due volte. */
export function tracciaAcquisto(valore: number, eventId: string) {
  if (!window.fbq) return;
  window.fbq('track', 'Purchase', { value: valore, currency: 'EUR' }, { eventID: eventId });
}

/** Il codice che lega l'acquisto visto dal browser a quello che il
 *  server manda a Meta (Conversions API). Il server manda l'acquisto a
 *  Meta SOLO se riceve questo codice, e il codice esiste solo se il
 *  cliente ha accettato i cookie di marketing: senza consenso, email e
 *  telefono del cliente non partono verso Meta nemmeno dal server. */
export function nuovoEventIdMeta(): string | undefined {
  return haConsensoPer('marketing') ? crypto.randomUUID() : undefined;
}

/** Cookie _fbp/_fbc che il Pixel imposta da solo una volta caricato —
 *  li mandiamo al server insieme all'ordine per il "match quality"
 *  della Conversions API. undefined se il Pixel non e' partito
 *  (consenso non dato). */
export function leggiCookieMeta(): { fbp?: string; fbc?: string } {
  const leggi = (nome: string) => document.cookie.split('; ').find((r) => r.startsWith(`${nome}=`))?.split('=')[1];
  return { fbp: leggi('_fbp'), fbc: leggi('_fbc') };
}
