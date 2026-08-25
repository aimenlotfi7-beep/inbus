/**
 * INBUS — Widget White Label incorporato (embed.js)
 * ===================================================
 *
 * Questo è IL file che l'organizzatore mette sul proprio sito, così:
 *
 *   <div id="inbus-widget"></div>
 *   <script src="https://.../embed.js" data-inbus-widget="PUBLIC_WIDGET_ID"></script>
 *
 * Scritto a mano in JavaScript puro, senza framework né dipendenze —
 * di proposito: è uno script che gira su siti di terzi, ogni byte e
 * ogni dipendenza in più diventano un problema che non controlliamo
 * (conflitti con librerie già presenti sul sito ospitante, tempi di
 * caricamento, ecc). Isola tutto in un Web Component con Shadow DOM,
 * così il CSS del widget non tocca mai il sito ospitante e viceversa.
 *
 * Non contiene MAI: password, JWT, secret, dati del cliente, prezzi
 * modificabili — chiede solo la configurazione pubblica (tema + info
 * evento) all'API pubblica; il vero checkout incorporato arriva con
 * una tappa successiva — per ora il pulsante "Prenota" porta al sito
 * INBUS per completare l'acquisto.
 *
 * COME MODIFICARE QUESTO FILE:
 * - Il rendering (renderizzaContenuto) deve restare visivamente
 *   allineato a WhiteLabelPreview.tsx (packages/frontend/src/features/
 *   white-label/WhiteLabelPreview.tsx) — stessa idea scritta due volte
 *   per motivi tecnici (uno è React per l'anteprima admin, questo è
 *   vanilla per restare leggero sul sito di terzi).
 * - Le proprietà del tema sono definite lato server in
 *   white-label.theme.ts — se ne aggiungi una lì, aggiornala anche qui.
 */
(function () {
  'use strict';

  var API_BASE_DEFAULT = 'https://inbus-production.up.railway.app';
  var SITO_INBUS_DEFAULT = 'https://inbus-eosin.vercel.app';

  var script = document.currentScript;
  var publicWidgetId = script ? script.getAttribute('data-inbus-widget') : null;
  var apiBase = (script && script.getAttribute('data-inbus-api')) || API_BASE_DEFAULT;
  var sitoBase = (script && script.getAttribute('data-inbus-sito')) || SITO_INBUS_DEFAULT;

  if (!publicWidgetId) {
    console.error('[INBUS widget] Manca data-inbus-widget sul tag <script> — il widget non può caricarsi senza.');
    return;
  }

  function InbusWidgetElement() {
    return Reflect.construct(HTMLElement, [], InbusWidgetElement);
  }
  InbusWidgetElement.prototype = Object.create(HTMLElement.prototype);
  InbusWidgetElement.prototype.constructor = InbusWidgetElement;
  Object.setPrototypeOf(InbusWidgetElement, HTMLElement);

  InbusWidgetElement.prototype.connectedCallback = function () {
    var root = this.attachShadow({ mode: 'closed' });
    renderizzaCaricamento(root);

    var widgetId = this.getAttribute('public-widget-id');
    fetch(apiBase + '/api/public/widget/' + encodeURIComponent(widgetId))
      .then(function (res) {
        if (!res.ok) throw new Error('Widget non trovato o non più disponibile.');
        return res.json();
      })
      .then(function (dati) { renderizzaContenuto(root, dati, widgetId); })
      .catch(function (err) { renderizzaErrore(root, err.message); });
  };

  if (!customElements.get('inbus-widget')) {
    customElements.define('inbus-widget', InbusWidgetElement);
  }

  function renderizzaCaricamento(root) {
    root.innerHTML = '<div style="font-family:sans-serif;color:#a99fc2;padding:20px;text-align:center;">Carico...</div>';
  }
  function renderizzaErrore(root, messaggio) {
    root.innerHTML = '<div style="font-family:sans-serif;color:#a99fc2;padding:20px;text-align:center;">' + escapeHtml(messaggio) + '</div>';
  }
  function escapeHtml(testo) {
    var d = document.createElement('div');
    d.textContent = String(testo);
    return d.innerHTML;
  }

  function renderizzaContenuto(root, dati, widgetId) {
    var tema = dati.tema;
    var evento = dati.evento;
    var b = tema.branding, c = tema.colori, t = tema.tipografia, s = tema.stile, l = tema.layout, v = tema.elementiVisibili;

    var stiliPulsante = 'height:' + s.altezzaPulsantePx + 'px;' +
      'border-radius:' + (s.stilePulsanti === 'arrotondato' ? '999px' : s.borderRadiusPx + 'px') + ';' +
      'background:' + (s.stilePulsanti === 'contorno' ? 'transparent' : c.cta) + ';' +
      'color:' + (s.stilePulsanti === 'contorno' ? c.cta : c.testoCta) + ';' +
      'border:' + (s.stilePulsanti === 'contorno' ? '1.5px solid ' + c.cta : 'none') + ';' +
      'font-family:' + t.font + ',sans-serif;font-weight:700;font-size:' + t.dimensioneTestoPx + 'px;width:100%;cursor:pointer;';

    var dataFormattata = new Date(evento.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

    var html = '';
    html += '<div style="width:100%;max-width:400px;box-sizing:border-box;background:' + c.superficie + ';border-radius:' + s.borderRadiusPx + 'px;border:1px solid ' + c.bordi + ';padding:' + s.spaziaturaPx + 'px;font-family:' + t.font + ',sans-serif;color:' + c.testoPrincipale + ';">';

    if (v.logo && b.logoUrl) {
      var giustifica = b.posizioneLogo === 'in-alto-al-centro' ? 'center' : b.posizioneLogo === 'in-alto-a-destra' ? 'flex-end' : 'flex-start';
      html += '<div style="display:flex;justify-content:' + giustifica + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;"><img src="' + escapeHtml(b.logoUrl) + '" alt="" style="height:' + b.dimensioneLogoPx + 'px;display:block;" /></div>';
    }
    if (v.immagine && (b.immaginePrincipaleUrl || l.tipo === 'hero')) {
      var sfondoImg = b.immaginePrincipaleUrl ? 'url(' + b.immaginePrincipaleUrl + ') center/cover' : c.bordi;
      html += '<div style="width:100%;aspect-ratio:' + (l.tipo === 'hero' ? '16/9' : '4/3') + ';background:' + sfondoImg + ';border-radius:' + (s.borderRadiusPx * 0.7) + 'px;margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;"></div>';
    }
    if (v.titolo) {
      html += '<h3 style="font-size:' + t.dimensioneTitoloPx + 'px;margin:0 0 ' + (s.spaziaturaPx * 0.3) + 'px;font-weight:800;line-height:1.15;">' + escapeHtml(evento.artista) + '</h3>';
    }
    html += '<div style="font-size:' + t.dimensioneTestoPx + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.5) + 'px;line-height:1.5;">';
    if (v.data) html += '<div>\uD83D\uDCC5 ' + escapeHtml(dataFormattata) + '</div>';
    if (v.percorso) html += '<div>\uD83D\uDCCD ' + escapeHtml(evento.luogo) + ', ' + escapeHtml(evento.citta) + '</div>';
    html += '</div>';

    if (v.descrizione && evento.descrizione) {
      var desc = evento.descrizione.length > 120 ? evento.descrizione.slice(0, 120) + '…' : evento.descrizione;
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.95) + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;line-height:1.5;">' + escapeHtml(desc) + '</p>';
    }
    if (v.fermate) {
      html += '<div style="font-size:' + (t.dimensioneTestoPx * 0.9) + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.3) + 'px;">Scegli la tua fermata di partenza</div>';
    }
    if (v.disponibilita) {
      html += '<div style="font-size:' + (t.dimensioneTestoPx * 0.9) + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;">Posti disponibili</div>';
    }

    if (!dati.attiva) {
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.9) + 'px;color:' + c.testoSecondario + ';text-align:center;">Non disponibile per l\'acquisto al momento.</p>';
    } else if (v.cta) {
      html += '<button id="inbus-cta" style="' + stiliPulsante + '">Prenota ora</button>';
    }

    if (v.informazioni) {
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.8) + 'px;color:' + c.testoSecondario + ';margin-top:' + (s.spaziaturaPx * 0.5) + 'px;text-align:center;">Viaggio organizzato da INBUS</p>';
    }
    html += '</div>';

    root.innerHTML = html;

    var pulsante = root.querySelector('#inbus-cta');
    if (pulsante) {
      pulsante.addEventListener('click', function () {
        window.open(sitoBase + '/w/' + encodeURIComponent(widgetId), '_blank', 'noopener');
      });
    }
  }

  function monta() {
    var contenitore = document.getElementById('inbus-widget');
    var el = document.createElement('inbus-widget');
    el.setAttribute('public-widget-id', publicWidgetId);
    if (contenitore) {
      contenitore.appendChild(el);
    } else if (script && script.parentNode) {
      script.parentNode.insertBefore(el, script.nextSibling);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monta);
  } else {
    monta();
  }
})();
