/**
 * INBUS — Widget White Label incorporato (embed.js)
 * ===================================================
 *
 *   <div id="inbus-widget"></div>
 *   <script src="https://.../embed.js" data-inbus-widget="PUBLIC_WIDGET_ID"></script>
 *
 * JavaScript puro, zero dipendenze — gira su siti di terzi, ogni
 * dipendenza in più è un rischio di conflitto che non controlliamo.
 * Web Component con Shadow DOM "closed": isolamento totale, il sito
 * ospitante non può leggere né scrivere dentro col proprio CSS/JS.
 *
 * FLUSSO COMPLETO (Tappa 4): vetrina -> login/registrazione vera
 * (stesso account INBUS, mai un redirect) -> scelta fermata e
 * passeggeri -> prenotazione vera. Il prezzo, la disponibilità e il
 * blocco posti sono SEMPRE calcolati dal server (stessa identica
 * funzione del sito principale, mai duplicata) — questo file non
 * decide mai un prezzo, si limita a mostrare quello che il server
 * calcola e a mandare la richiesta.
 *
 * Non contiene MAI: password in chiaro salvate, secret, dati di altri
 * clienti, prezzi modificabili dal browser.
 *
 * COME MODIFICARE QUESTO FILE:
 * - La vetrina (renderVetrina) deve restare visivamente allineata a
 *   WhiteLabelPreview.tsx (packages/frontend/src/features/white-label/
 *   WhiteLabelPreview.tsx) — stessa idea scritta due volte per motivi
 *   tecnici (React per l'anteprima admin, vanilla qui).
 * - Le proprietà del tema sono definite lato server in
 *   white-label.theme.ts — se ne aggiungi una lì, aggiornala anche qui.
 */
(function () {
  'use strict';

  var API_BASE_DEFAULT = 'https://inbus-production.up.railway.app';

  var script = document.currentScript;
  var publicWidgetId = script ? script.getAttribute('data-inbus-widget') : null;
  var apiBase = (script && script.getAttribute('data-inbus-api')) || API_BASE_DEFAULT;

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
    var widgetId = this.getAttribute('public-widget-id');
    new WidgetApp(root, widgetId, apiBase).avvia();
  };

  if (!customElements.get('inbus-widget')) {
    customElements.define('inbus-widget', InbusWidgetElement);
  }

  function escapeHtml(testo) {
    var d = document.createElement('div');
    d.textContent = String(testo);
    return d.innerHTML;
  }

  function WidgetApp(root, widgetId, apiBase) {
    this.root = root;
    this.widgetId = widgetId;
    this.apiBase = apiBase;
    this.dati = null;
    this.opzioni = null;
    this.token = null;
    this.vista = 'caricamento';
    this.erroreVista = '';
    this.prenotazioneFatta = null;
  }

  WidgetApp.prototype.avvia = function () {
    var self = this;
    this.render();
    this.chiamata('GET', '/api/public/widget/' + encodeURIComponent(this.widgetId))
      .then(function (dati) {
        self.dati = dati;
        self.vista = 'vetrina';
        self.render();
      })
      .catch(function (err) {
        self.vista = 'errore-caricamento';
        self.erroreVista = err.message;
        self.render();
      });
  };

  WidgetApp.prototype.chiamata = function (metodo, percorso, corpo, conToken) {
    var self = this;
    var opzioni = { method: metodo, headers: { 'Content-Type': 'application/json' } };
    if (corpo) opzioni.body = JSON.stringify(corpo);
    if (conToken && this.token) opzioni.headers['Authorization'] = 'Bearer ' + this.token;
    return fetch(this.apiBase + percorso, opzioni).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) throw new Error(json.messaggio || json.errore || 'Qualcosa è andato storto, riprova.');
        return json;
      });
    });
  };

  WidgetApp.prototype.render = function () {
    if (this.vista === 'caricamento') return this.renderCaricamento();
    if (this.vista === 'errore-caricamento') return this.renderErrore(this.erroreVista);
    if (this.vista === 'vetrina') return this.renderVetrina();
    if (this.vista === 'auth') return this.renderAuth();
    if (this.vista === 'login') return this.renderLogin();
    if (this.vista === 'registrati') return this.renderRegistrati();
    if (this.vista === 'registrati-fatto') return this.renderRegistratiFatto();
    if (this.vista === 'prenotazione') return this.renderPrenotazione();
    if (this.vista === 'conferma') return this.renderConferma();
  };

  WidgetApp.prototype.renderCaricamento = function () {
    this.root.innerHTML = '<div style="font-family:sans-serif;color:#a99fc2;padding:20px;text-align:center;">Carico...</div>';
  };
  WidgetApp.prototype.renderErrore = function (messaggio) {
    this.root.innerHTML = '<div style="font-family:sans-serif;color:#a99fc2;padding:20px;text-align:center;">' + escapeHtml(messaggio) + '</div>';
  };

  function stiliContenitore(tema) {
    return 'width:100%;max-width:400px;box-sizing:border-box;background:' + tema.colori.superficie +
      ';border-radius:' + tema.stile.borderRadiusPx + 'px;border:1px solid ' + tema.colori.bordi +
      ';padding:' + tema.stile.spaziaturaPx + 'px;font-family:' + tema.tipografia.font +
      ',sans-serif;color:' + tema.colori.testoPrincipale + ';';
  }
  function stiliPulsante(tema, secondario) {
    var c = tema.colori, s = tema.stile, t = tema.tipografia;
    if (secondario) {
      return 'height:' + s.altezzaPulsantePx + 'px;border-radius:' + s.borderRadiusPx + 'px;background:transparent;color:' + c.testoSecondario + ';border:1px solid ' + c.bordi + ';font-family:' + t.font + ',sans-serif;font-weight:600;font-size:' + t.dimensioneTestoPx + 'px;width:100%;cursor:pointer;margin-top:8px;';
    }
    return 'height:' + s.altezzaPulsantePx + 'px;' +
      'border-radius:' + (s.stilePulsanti === 'arrotondato' ? '999px' : s.borderRadiusPx + 'px') + ';' +
      'background:' + (s.stilePulsanti === 'contorno' ? 'transparent' : c.cta) + ';' +
      'color:' + (s.stilePulsanti === 'contorno' ? c.cta : c.testoCta) + ';' +
      'border:' + (s.stilePulsanti === 'contorno' ? '1.5px solid ' + c.cta : 'none') + ';' +
      'font-family:' + t.font + ',sans-serif;font-weight:700;font-size:' + t.dimensioneTestoPx + 'px;width:100%;cursor:pointer;';
  }
  function stiliInput(tema) {
    return 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:' + Math.min(tema.stile.borderRadiusPx, 8) +
      'px;border:1px solid ' + tema.colori.bordi + ';background:transparent;color:' + tema.colori.testoPrincipale +
      ';font-family:' + tema.tipografia.font + ',sans-serif;font-size:' + tema.tipografia.dimensioneTestoPx + 'px;margin-bottom:8px;';
  }

  WidgetApp.prototype.renderVetrina = function () {
    var self = this;
    var tema = this.dati.tema, evento = this.dati.evento;
    var b = tema.branding, c = tema.colori, t = tema.tipografia, s = tema.stile, l = tema.layout, v = tema.elementiVisibili;
    var dataFormattata = new Date(evento.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

    var html = '<div style="' + stiliContenitore(tema) + '">';
    if (v.logo && b.logoUrl) {
      var giustifica = b.posizioneLogo === 'in-alto-al-centro' ? 'center' : b.posizioneLogo === 'in-alto-a-destra' ? 'flex-end' : 'flex-start';
      html += '<div style="display:flex;justify-content:' + giustifica + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;"><img src="' + escapeHtml(b.logoUrl) + '" alt="" style="height:' + b.dimensioneLogoPx + 'px;display:block;" /></div>';
    }
    if (v.immagine && (b.immaginePrincipaleUrl || l.tipo === 'hero')) {
      var sfondoImg = b.immaginePrincipaleUrl ? 'url(' + b.immaginePrincipaleUrl + ') center/cover' : c.bordi;
      html += '<div style="width:100%;aspect-ratio:' + (l.tipo === 'hero' ? '16/9' : '4/3') + ';background:' + sfondoImg + ';border-radius:' + (s.borderRadiusPx * 0.7) + 'px;margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;"></div>';
    }
    if (v.titolo) html += '<h3 style="font-size:' + t.dimensioneTitoloPx + 'px;margin:0 0 ' + (s.spaziaturaPx * 0.3) + 'px;font-weight:800;line-height:1.15;">' + escapeHtml(evento.artista) + '</h3>';
    html += '<div style="font-size:' + t.dimensioneTestoPx + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.5) + 'px;line-height:1.5;">';
    if (v.data) html += '<div>\uD83D\uDCC5 ' + escapeHtml(dataFormattata) + '</div>';
    if (v.percorso) html += '<div>\uD83D\uDCCD ' + escapeHtml(evento.luogo) + ', ' + escapeHtml(evento.citta) + '</div>';
    html += '</div>';
    if (v.descrizione && evento.descrizione) {
      var desc = evento.descrizione.length > 120 ? evento.descrizione.slice(0, 120) + '…' : evento.descrizione;
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.95) + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;line-height:1.5;">' + escapeHtml(desc) + '</p>';
    }

    if (!this.dati.attiva) {
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.9) + 'px;color:' + c.testoSecondario + ';text-align:center;">Non disponibile per l\'acquisto al momento.</p>';
    } else if (v.cta) {
      html += '<button id="btn-cta" style="' + stiliPulsante(tema) + '">Prenota ora</button>';
    }
    if (v.informazioni) {
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.8) + 'px;color:' + c.testoSecondario + ';margin-top:' + (s.spaziaturaPx * 0.5) + 'px;text-align:center;">Viaggio organizzato da INBUS</p>';
    }
    html += '</div>';
    this.root.innerHTML = html;

    var btn = this.root.querySelector('#btn-cta');
    if (btn) btn.addEventListener('click', function () { self.vista = 'auth'; self.render(); });
  };

  WidgetApp.prototype.renderAuth = function () {
    var self = this;
    var tema = this.dati.tema;
    var html = '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Accedi o registrati per continuare</p>' +
      '<button id="btn-login" style="' + stiliPulsante(tema) + '">Ho già un account</button>' +
      '<button id="btn-registrati" style="' + stiliPulsante(tema, true) + '">Creo un account nuovo</button>' +
      '</div>';
    this.root.innerHTML = html;
    this.root.querySelector('#btn-login').addEventListener('click', function () { self.vista = 'login'; self.render(); });
    this.root.querySelector('#btn-registrati').addEventListener('click', function () { self.vista = 'registrati'; self.render(); });
  };

  WidgetApp.prototype.renderLogin = function () {
    var self = this;
    var tema = this.dati.tema;
    var html = '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Accedi</p>' +
      '<input id="in-email" type="email" placeholder="Email" style="' + stiliInput(tema) + '" />' +
      '<input id="in-password" type="password" placeholder="Password" style="' + stiliInput(tema) + '" />' +
      '<p id="msg-errore" style="color:#e05c5c;font-size:12px;margin:0 0 8px;"></p>' +
      '<button id="btn-invia" style="' + stiliPulsante(tema) + '">Accedi</button>' +
      '</div>';
    this.root.innerHTML = html;
    this.root.querySelector('#btn-invia').addEventListener('click', function () {
      var email = self.root.querySelector('#in-email').value;
      var password = self.root.querySelector('#in-password').value;
      self.chiamata('POST', '/api/cliente-auth/login', { email: email, password: password })
        .then(function (r) {
          self.token = r.token;
          self.vista = 'prenotazione';
          self.caricaOpzioniECambiaVista();
        })
        .catch(function (err) { self.root.querySelector('#msg-errore').textContent = err.message; });
    });
  };

  WidgetApp.prototype.renderRegistrati = function () {
    var self = this;
    var tema = this.dati.tema;
    var html = '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Crea un account</p>' +
      '<input id="in-nome" placeholder="Nome" style="' + stiliInput(tema) + '" />' +
      '<input id="in-cognome" placeholder="Cognome" style="' + stiliInput(tema) + '" />' +
      '<input id="in-email" type="email" placeholder="Email" style="' + stiliInput(tema) + '" />' +
      '<input id="in-telefono" placeholder="Telefono" style="' + stiliInput(tema) + '" />' +
      '<input id="in-password" type="password" placeholder="Password (almeno 8 caratteri)" style="' + stiliInput(tema) + '" />' +
      '<p id="msg-errore" style="color:#e05c5c;font-size:12px;margin:0 0 8px;"></p>' +
      '<button id="btn-invia" style="' + stiliPulsante(tema) + '">Crea account</button>' +
      '</div>';
    this.root.innerHTML = html;
    this.root.querySelector('#btn-invia').addEventListener('click', function () {
      var corpo = {
        nome: self.root.querySelector('#in-nome').value,
        cognome: self.root.querySelector('#in-cognome').value,
        email: self.root.querySelector('#in-email').value,
        telefono: self.root.querySelector('#in-telefono').value,
        password: self.root.querySelector('#in-password').value,
      };
      self.chiamata('POST', '/api/cliente-auth/registrati', corpo)
        .then(function () { self.vista = 'registrati-fatto'; self.render(); })
        .catch(function (err) { self.root.querySelector('#msg-errore').textContent = err.message; });
    });
  };

  WidgetApp.prototype.renderRegistratiFatto = function () {
    var tema = this.dati.tema;
    this.root.innerHTML = '<div style="' + stiliContenitore(tema) + '">' +
      '<p>✓ Controlla la tua email per confermare l\'account, poi torna qui e accedi per completare la prenotazione.</p>' +
      '</div>';
  };

  WidgetApp.prototype.caricaOpzioniECambiaVista = function () {
    var self = this;
    this.render();
    this.chiamata('GET', '/api/public/widget/' + encodeURIComponent(this.widgetId) + '/opzioni-partenza')
      .then(function (opzioni) {
        self.opzioni = opzioni;
        self.render();
      })
      .catch(function (err) {
        self.vista = 'errore-caricamento';
        self.erroreVista = err.message;
        self.render();
      });
  };

  WidgetApp.prototype.renderPrenotazione = function () {
    var self = this;
    var tema = this.dati.tema;
    if (!this.opzioni) {
      this.root.innerHTML = '<div style="' + stiliContenitore(tema) + '">Carico le fermate disponibili...</div>';
      return;
    }
    var opzOptions = this.opzioni.map(function (o) {
      return '<option value="' + o.fermataId + '">' + escapeHtml(o.fermataCitta) + ' — €' + o.prezzoEffettivo + '</option>';
    }).join('');

    var html = '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Completa la prenotazione</p>' +
      '<label style="font-size:12px;color:' + tema.colori.testoSecondario + ';">Fermata di partenza</label>' +
      '<select id="in-fermata" style="' + stiliInput(tema) + '">' + opzOptions + '</select>' +
      '<label style="font-size:12px;color:' + tema.colori.testoSecondario + ';">Passeggeri</label>' +
      '<input id="in-passeggeri" type="number" min="1" max="20" value="1" style="' + stiliInput(tema) + '" />' +
      '<input id="in-nome" placeholder="Nome" style="' + stiliInput(tema) + '" />' +
      '<input id="in-cognome" placeholder="Cognome" style="' + stiliInput(tema) + '" />' +
      '<input id="in-email" type="email" placeholder="Email" style="' + stiliInput(tema) + '" />' +
      '<input id="in-telefono" placeholder="Telefono" style="' + stiliInput(tema) + '" />' +
      '<p id="msg-errore" style="color:#e05c5c;font-size:12px;margin:0 0 8px;"></p>' +
      '<button id="btn-invia" style="' + stiliPulsante(tema) + '">Conferma prenotazione</button>' +
      '</div>';
    this.root.innerHTML = html;

    this.root.querySelector('#btn-invia').addEventListener('click', function () {
      var fermataId = self.root.querySelector('#in-fermata').value;
      var opzioneScelta = self.opzioni.filter(function (o) { return o.fermataId === fermataId; })[0];
      var passeggeri = parseInt(self.root.querySelector('#in-passeggeri').value, 10) || 1;
      var corpo = {
        eventoId: self.dati.evento.id,
        tragittoId: opzioneScelta ? opzioneScelta.tragittoId : undefined,
        fermataId: fermataId,
        passeggeri: passeggeri,
        tipoPagamento: 'COMPLETO',
        metodoPagamento: 'DA_CONCORDARE',
        cliente: {
          nome: self.root.querySelector('#in-nome').value,
          cognome: self.root.querySelector('#in-cognome').value,
          email: self.root.querySelector('#in-email').value,
          telefono: self.root.querySelector('#in-telefono').value,
        },
        partecipanti: [],
      };
      self.chiamata('POST', '/api/public/widget/' + encodeURIComponent(self.widgetId) + '/prenota', corpo, true)
        .then(function (r) {
          self.prenotazioneFatta = r;
          self.vista = 'conferma';
          self.render();
        })
        .catch(function (err) { self.root.querySelector('#msg-errore').textContent = err.message; });
    });
  };

  WidgetApp.prototype.renderConferma = function () {
    var tema = this.dati.tema;
    var pnr = this.prenotazioneFatta ? this.prenotazioneFatta.pnr : '';
    this.root.innerHTML = '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:800;font-size:' + tema.tipografia.dimensioneTitoloPx + 'px;margin:0 0 8px;">✓ Prenotazione confermata</p>' +
      '<p style="color:' + tema.colori.testoSecondario + ';font-size:' + tema.tipografia.dimensioneTestoPx + 'px;">Codice prenotazione: <b>' + escapeHtml(pnr) + '</b>. Riceverai una email di conferma con il tuo biglietto.</p>' +
      '</div>';
  };

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
