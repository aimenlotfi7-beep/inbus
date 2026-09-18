/**
 * OnWay — Widget White Label da incollare nel sito del cliente (embed.js)
 * ======================================================================
 *
 *   <div id="inbus-widget"></div>
 *   <script src="https://.../embed.js" data-inbus-widget="PUBLIC_WIDGET_ID"></script>
 *
 * Crea, dentro il sito del cliente, una finestra sulla stessa pagina del
 * link (/w/PUBLIC_WIDGET_ID) in modalità "incorporata": solo il riquadro
 * con la grafica del cliente, senza sfondo di pagina. Chi compra resta
 * sul sito dell'organizzatore e trova la prenotazione completa del link
 * (acconto, codici sconto, credito, fermate con orari), non una copia
 * ridotta: prima questo file aveva una sua prenotazione scritta a parte,
 * più povera e che si era rotta (settembre 2026, scelta del proprietario).
 *
 * La finestra è alta quanto il contenuto: la pagina dentro dice la sua
 * altezza con postMessage (useFinestraIncorporata in
 * WidgetPubblicoPage.tsx) e qui si accettano solo i messaggi che arrivano
 * da quella finestra e dal nostro sito. Resta invisibile finché la pagina
 * non è pronta, così il sito del cliente non vede lampi di colore.
 *
 * JavaScript puro, zero dipendenze: gira su siti di terzi. Il codice da
 * dare ai clienti è lo stesso di prima; data-inbus-api non serve più (la
 * pagina dentro la finestra sa già a quale server parlare).
 *
 * data-inbus-evento="slug" (facoltativo): con una White Label di più
 * eventi, il codice di un evento solo (settembre 2026). Senza: tutti gli
 * eventi in card, o dritti alla prenotazione se ce n'è uno solo.
 * data-inbus-contenitore="id" (facoltativo, di serie "inbus-widget"): il
 * riquadro in cui mettersi, così più codici stanno nella stessa pagina.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var publicWidgetId = script ? script.getAttribute('data-inbus-widget') : null;
  if (!publicWidgetId) {
    console.error('[OnWay widget] Manca data-inbus-widget sul tag <script>: il widget non può caricarsi senza.');
    return;
  }
  var evento = script.getAttribute('data-inbus-evento');
  var idContenitore = script.getAttribute('data-inbus-contenitore') || 'inbus-widget';
  // Il nostro sito è quello da cui arriva questo file.
  var sito = new URL(script.src, window.location.href).origin;

  function monta() {
    var contenitore = document.getElementById(idContenitore);
    if (contenitore && contenitore.querySelector('iframe[data-inbus-widget]')) return;

    var finestra = document.createElement('iframe');
    finestra.src = sito + '/w/' + encodeURIComponent(publicWidgetId) + '?incorporato=1' +
      (evento ? '&evento=' + encodeURIComponent(evento) : '');
    finestra.title = 'Prenotazione del viaggio';
    finestra.setAttribute('data-inbus-widget', publicWidgetId);
    finestra.setAttribute('scrolling', 'no');
    // "Usa la mia posizione" per trovare la fermata più vicina.
    finestra.setAttribute('allow', 'geolocation');
    finestra.style.cssText = 'display:block;width:100%;height:420px;border:0;margin:0;padding:0;' +
      'background:transparent;overflow:hidden;color-scheme:normal;opacity:0;transition:opacity .2s ease;';

    window.addEventListener('message', function (evento) {
      if (evento.origin !== sito || evento.source !== finestra.contentWindow || !evento.data) return;
      if (evento.data.tipo === 'inbus-widget-altezza' && evento.data.altezza > 0) {
        finestra.style.height = evento.data.altezza + 'px';
        finestra.style.opacity = '1';
      }
      // Passo nuovo (accesso, prenotazione, conferma): se l'inizio della
      // finestra è salito fuori dallo schermo, la si riporta in vista.
      if (evento.data.tipo === 'inbus-widget-passo' && finestra.getBoundingClientRect().top < 0) {
        finestra.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    if (contenitore) {
      contenitore.appendChild(finestra);
    } else if (script.parentNode) {
      script.parentNode.insertBefore(finestra, script.nextSibling);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monta);
  } else {
    monta();
  }
})();
