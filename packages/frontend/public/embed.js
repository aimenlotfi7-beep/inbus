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
  // Il sito da cui arriva questo file: lì stanno condizioni e privacy.
  var sitoBase = script && script.src ? new URL(script.src).origin : '';
  // Prezzi come nel sito ("39,00 €"), non "€39".
  var euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

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
      // Una risposta che non è JSON (per esempio una pagina d'errore) non
      // deve finire al cliente come "Unexpected token…".
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.messaggio || json.errore || 'Qualcosa è andato storto, riprova.');
        return json;
      });
    }, function () {
      throw new Error('Connessione non riuscita: controlla la rete e riprova.');
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

  /** Carico ed errore: già con i colori del cliente se il tema è arrivato. */
  WidgetApp.prototype.stiliMessaggio = function () {
    var tema = this.dati && this.dati.tema;
    if (!tema) return 'font-family:' + RIPIEGO_FONT + ';color:#a99fc2;padding:20px;text-align:center;';
    return 'font-family:' + famigliaFont(tema.tipografia.font) + ';color:' + tema.colori.testoSecondario +
      ';background:' + tema.colori.superficie + ';border-radius:' + tema.stile.borderRadiusPx + 'px;padding:20px;text-align:center;';
  };
  WidgetApp.prototype.renderCaricamento = function () {
    this.root.innerHTML = stileFont(this.dati && this.dati.tema) + '<div style="' + this.stiliMessaggio() + '">Carico…</div>';
  };
  WidgetApp.prototype.renderErrore = function (messaggio) {
    this.root.innerHTML = stileFont(this.dati && this.dati.tema) + '<div style="' + this.stiliMessaggio() + '">' + escapeHtml(messaggio) + '</div>';
  };

  var RIPIEGO_FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

  /** Il font come lo scrive il CSS ("Di sistema" o vuoto = quello del dispositivo). */
  function famigliaFont(nome) {
    var pulito = (nome || '').trim();
    if (!pulito || pulito.toLowerCase() === 'di sistema') return RIPIEGO_FONT;
    return "'" + pulito.replace(/'/g, '') + "'," + RIPIEGO_FONT;
  }

  /** Lo stile dentro lo shadow root: il widget deve occupare spazio nella
   *  pagina che lo ospita (l'elemento nasce "in riga" e resterebbe alto
   *  zero), e i font del tema vanno chiesti a Google Fonts con @import,
   *  perché i <link> della pagina ospite non entrano nello shadow root. */
  function stileFont(tema) {
    var base = ':host{display:block;box-sizing:border-box;}';
    var nomi = (tema ? [tema.tipografia.font, tema.tipografia.fontTitoli] : []).filter(function (n, i, tutti) {
      var pulito = (n || '').trim();
      return pulito && pulito.toLowerCase() !== 'di sistema' && tutti.indexOf(n) === i;
    });
    var imports = nomi.map(function (n) {
      return "@import url('https://fonts.googleapis.com/css2?family=" + encodeURIComponent(n.trim()) + ":wght@400;600;700;800&display=swap');";
    }).join('');
    // Gli @import vanno prima di qualsiasi altra regola, o il browser li scarta.
    return '<style>' + imports + base + '</style>';
  }

  function stiliContenitore(tema) {
    var s = tema.stile;
    return 'width:100%;max-width:' + (s.larghezzaPx || 400) + 'px;box-sizing:border-box;background:' + tema.colori.superficie +
      ';border-radius:' + s.borderRadiusPx + 'px;border:' + (s.mostraBordi === false ? 'none' : '1px solid ' + tema.colori.bordi) +
      ';box-shadow:' + (s.ombre ? '0 10px 30px rgba(0,0,0,.18)' : 'none') +
      ';padding:' + s.spaziaturaPx + 'px;font-family:' + famigliaFont(tema.tipografia.font) +
      ';font-size:' + tema.tipografia.dimensioneTestoPx + 'px;color:' + tema.colori.testoPrincipale + ';';
  }
  function stiliPulsante(tema, secondario) {
    var c = tema.colori, s = tema.stile, t = tema.tipografia;
    var raggio = s.stilePulsanti === 'arrotondato' ? '999px' : s.borderRadiusPx + 'px';
    if (secondario) {
      return 'height:' + s.altezzaPulsantePx + 'px;border-radius:' + raggio +
        ';background:' + (s.stilePulsanti === 'contorno' ? 'transparent' : c.ctaSecondaria) +
        ';color:' + c.testoCtaSecondaria + ';border:1px solid ' + c.bordi +
        ';font-family:' + famigliaFont(t.font) + ';font-weight:600;font-size:' + t.dimensioneTestoPx + 'px;width:100%;cursor:pointer;margin-top:8px;';
    }
    return 'height:' + s.altezzaPulsantePx + 'px;' +
      'border-radius:' + raggio + ';' +
      'background:' + (s.stilePulsanti === 'contorno' ? 'transparent' : c.cta) + ';' +
      'color:' + (s.stilePulsanti === 'contorno' ? c.cta : c.testoCta) + ';' +
      'border:' + (s.stilePulsanti === 'contorno' ? '1.5px solid ' + c.cta : 'none') + ';' +
      'font-family:' + famigliaFont(t.font) + ';font-weight:700;font-size:' + t.dimensioneTestoPx + 'px;width:100%;cursor:pointer;';
  }
  function stiliInput(tema) {
    return 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:' + Math.min(tema.stile.borderRadiusPx, 12) +
      'px;border:1px solid ' + tema.colori.bordi + ';background:' + tema.colori.campoSfondo + ';color:' + tema.colori.campoTesto +
      ';font-family:' + famigliaFont(tema.tipografia.font) + ';font-size:' + tema.tipografia.dimensioneTestoPx + 'px;margin-bottom:8px;';
  }
  /** Un campo con l'etichetta sopra (come Campo in WidgetPubblicoPage.tsx):
   *  il solo testo grigio dentro sparisce appena si scrive, e nei campi
   *  data il telefono non lo mostra proprio. */
  function campo(tema, id, etichetta, tipo, attributi, valore) {
    return '<label for="' + id + '" style="display:block;margin:0 0 4px;font-size:' + (tema.tipografia.dimensioneTestoPx * 0.85) +
      'px;color:' + tema.colori.testoSecondario + ';">' + escapeHtml(etichetta) + '</label>' +
      '<input id="' + id + '" type="' + (tipo || 'text') + '" ' + (attributi || '') +
      (valore ? ' value="' + escapeHtml(valore) + '"' : '') + ' style="' + stiliInput(tema) + '" />';
  }
  function titoletto(tema, testo) {
    return '<p style="font-weight:700;margin:' + (tema.stile.spaziaturaPx * 0.4) + 'px 0 8px;">' + escapeHtml(testo) + '</p>';
  }
  /** Condizioni e privacy prima di creare l'account (è lo stesso account del sito). */
  function notaLegale(tema) {
    var stileLink = 'color:inherit;text-decoration:underline;';
    return '<p style="margin:10px 0 0;text-align:center;line-height:1.5;font-size:' + (tema.tipografia.dimensioneTestoPx * 0.8) + 'px;color:' + tema.colori.testoSecondario + ';">' +
      'Creando l\'account accetti le <a href="' + sitoBase + '/pagina/termini" target="_blank" rel="noopener" style="' + stileLink + '">condizioni</a> e ' +
      'confermi di aver letto l\'<a href="' + sitoBase + '/pagina/privacy" target="_blank" rel="noopener" style="' + stileLink + '">informativa privacy</a>.</p>';
  }
  function testoErrore() {
    return '<p id="msg-errore" role="alert" style="color:#e05c5c;font-size:12px;margin:0 0 8px;"></p>';
  }

  /** Il testo del tema, se c'è, altrimenti quello di serie. */
  function testoTema(tema, campo, diSerie) {
    var scritto = tema.testi && tema.testi[campo] ? String(tema.testi[campo]).trim() : '';
    return scritto || diSerie;
  }
  /** La nota in fondo: quella del tema e, solo col marchio acceso, OnWay. */
  function notaPiePagina(tema) {
    var nota = tema.testi && tema.testi.piePagina ? String(tema.testi.piePagina).trim() : '';
    var conMarchio = !tema.marchio || tema.marchio.mostraOnWay !== false;
    if (!conMarchio) return nota;
    return nota ? nota + ' · Viaggio organizzato da OnWay' : 'Viaggio organizzato da OnWay';
  }

  WidgetApp.prototype.renderVetrina = function () {
    var self = this;
    var tema = this.dati.tema, evento = this.dati.evento;
    var b = tema.branding, c = tema.colori, t = tema.tipografia, s = tema.stile, l = tema.layout, v = tema.elementiVisibili;
    var dataFormattata = new Date(evento.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

    var html = stileFont(tema) + '<div style="' + stiliContenitore(tema) + '">';
    if (v.logo && b.logoUrl) {
      var giustifica = b.posizioneLogo === 'in-alto-al-centro' ? 'center' : b.posizioneLogo === 'in-alto-a-destra' ? 'flex-end' : 'flex-start';
      html += '<div style="display:flex;justify-content:' + giustifica + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;"><img src="' + escapeHtml(b.logoUrl) + '" alt="" style="height:' + b.dimensioneLogoPx + 'px;max-width:100%;display:block;" /></div>';
    }
    var immagineVetrina = l.tipo === 'hero' ? (b.heroImageUrl || b.immaginePrincipaleUrl) : (b.immaginePrincipaleUrl || b.heroImageUrl);
    if (v.immagine && (immagineVetrina || l.tipo === 'hero')) {
      // Apici singoli: dentro style="…" le virgolette doppie chiudevano
      // l'attributo e l'immagine non compariva mai.
      var sfondoImg = immagineVetrina ? "url('" + String(immagineVetrina).replace(/'/g, '%27').replace(/"/g, '%22').replace(/\\/g, '%5C') + "') center/cover" : c.bordi;
      html += '<div style="width:100%;aspect-ratio:' + (l.tipo === 'hero' ? '16/9' : '4/3') + ';background:' + sfondoImg + ';border-radius:' + (s.borderRadiusPx * 0.7) + 'px;margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;"></div>';
    }
    if (v.titolo) {
      html += '<h3 style="font-family:' + famigliaFont(t.fontTitoli || t.font) + ';font-size:' + t.dimensioneTitoloPx + 'px;margin:0 0 ' + (s.spaziaturaPx * 0.3) + 'px;font-weight:800;line-height:1.15;">' + escapeHtml(testoTema(tema, 'titolo', evento.artista)) + '</h3>';
    }
    var sottotitolo = testoTema(tema, 'sottotitolo', '');
    if (sottotitolo) {
      html += '<p style="font-size:' + t.dimensioneTestoPx + 'px;color:' + c.testoSecondario + ';margin:0 0 ' + (s.spaziaturaPx * 0.4) + 'px;line-height:1.45;">' + escapeHtml(sottotitolo) + '</p>';
    }
    html += '<div style="font-size:' + t.dimensioneTestoPx + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.5) + 'px;line-height:1.5;">';
    if (v.data) html += '<div>' + escapeHtml(dataFormattata) + '</div>';
    if (v.percorso) html += '<div>' + escapeHtml(evento.luogo) + ', ' + escapeHtml(evento.citta) + '</div>';
    html += '</div>';
    if (v.descrizione && evento.descrizione) {
      var desc = evento.descrizione.length > 120 ? evento.descrizione.slice(0, 120) + '…' : evento.descrizione;
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.95) + 'px;color:' + c.testoSecondario + ';margin-bottom:' + (s.spaziaturaPx * 0.6) + 'px;line-height:1.5;">' + escapeHtml(desc) + '</p>';
    }

    if (!this.dati.attiva) {
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.9) + 'px;color:' + c.testoSecondario + ';text-align:center;">Non disponibile per l\'acquisto al momento.</p>';
    } else if (v.cta) {
      html += '<button id="btn-cta" style="' + stiliPulsante(tema) + '">' + escapeHtml(testoTema(tema, 'pulsante', 'Prenota ora')) + '</button>';
    }
    if (v.informazioni && notaPiePagina(tema)) {
      html += '<p style="font-size:' + (t.dimensioneTestoPx * 0.8) + 'px;color:' + c.testoSecondario + ';margin-top:' + (s.spaziaturaPx * 0.5) + 'px;text-align:center;">' + escapeHtml(notaPiePagina(tema)) + '</p>';
    }
    html += '</div>';
    this.root.innerHTML = html;

    var btn = this.root.querySelector('#btn-cta');
    if (btn) btn.addEventListener('click', function () { self.vista = 'auth'; self.render(); });
  };

  WidgetApp.prototype.renderAuth = function () {
    var self = this;
    var tema = this.dati.tema;
    var html = stileFont(tema) + '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Accedi o registrati per continuare</p>' +
      '<button id="btn-login" style="' + stiliPulsante(tema) + '">Ho già un account</button>' +
      '<button id="btn-registrati" style="' + stiliPulsante(tema, true) + '">Creo un account nuovo</button>' +
      '</div>';
    this.root.innerHTML = html;
    this.root.querySelector('#btn-login').addEventListener('click', function () { self.vista = 'login'; self.render(); });
    this.root.querySelector('#btn-registrati').addEventListener('click', function () { self.vista = 'registrati'; self.render(); });
  };

  /** Invio del modulo (anche con il tasto Invio): il pulsante si spegne
   *  finché il server non risponde, così un doppio clic non manda due volte. */
  WidgetApp.prototype.alInvio = function (azione) {
    var self = this;
    var modulo = this.root.querySelector('#modulo');
    modulo.addEventListener('submit', function (e) {
      e.preventDefault();
      var pulsante = modulo.querySelector('button[type=submit]');
      var errore = self.root.querySelector('#msg-errore');
      errore.textContent = '';
      pulsante.disabled = true;
      azione().catch(function (err) {
        errore.textContent = err.message;
        pulsante.disabled = false;
      });
    });
  };
  WidgetApp.prototype.valore = function (id) {
    return this.root.querySelector('#' + id).value.trim();
  };

  WidgetApp.prototype.renderLogin = function () {
    var self = this;
    var tema = this.dati.tema;
    this.root.innerHTML = stileFont(tema) + '<form id="modulo" style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Accedi</p>' +
      campo(tema, 'in-email', 'Email', 'email', 'autocomplete="email" required') +
      campo(tema, 'in-password', 'Password', 'password', 'autocomplete="current-password" required') +
      testoErrore() +
      '<button type="submit" style="' + stiliPulsante(tema) + '">Accedi</button>' +
      '</form>';
    this.alInvio(function () {
      return self.chiamata('POST', '/api/cliente-auth/login', { email: self.valore('in-email'), password: self.root.querySelector('#in-password').value })
        .then(function (r) {
          self.token = r.token;
          self.vista = 'prenotazione';
          self.caricaOpzioniECambiaVista();
        });
    });
  };

  WidgetApp.prototype.renderRegistrati = function () {
    var self = this;
    var tema = this.dati.tema;
    // La data di nascita è obbligatoria per il server (i gruppi sui bus si
    // formano per età): senza, la registrazione da qui falliva sempre.
    this.root.innerHTML = stileFont(tema) + '<form id="modulo" style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Crea un account</p>' +
      campo(tema, 'in-nome', 'Nome', 'text', 'autocomplete="given-name" required') +
      campo(tema, 'in-cognome', 'Cognome', 'text', 'autocomplete="family-name" required') +
      campo(tema, 'in-email', 'Email', 'email', 'autocomplete="email" required') +
      campo(tema, 'in-telefono', 'Telefono (facoltativo)', 'tel', 'autocomplete="tel"') +
      campo(tema, 'in-nascita', 'Data di nascita', 'date', 'autocomplete="bday" required') +
      campo(tema, 'in-password', 'Password (almeno 8 caratteri)', 'password', 'autocomplete="new-password" minlength="8" required') +
      testoErrore() +
      '<button type="submit" style="' + stiliPulsante(tema) + '">Crea account</button>' +
      notaLegale(tema) +
      '</form>';
    this.alInvio(function () {
      var corpo = {
        nome: self.valore('in-nome'),
        cognome: self.valore('in-cognome'),
        email: self.valore('in-email'),
        telefono: self.valore('in-telefono') || undefined,
        dataNascita: self.valore('in-nascita'),
        password: self.root.querySelector('#in-password').value,
      };
      return self.chiamata('POST', '/api/cliente-auth/registrati', corpo)
        .then(function () { self.vista = 'registrati-fatto'; self.render(); });
    });
  };

  WidgetApp.prototype.renderRegistratiFatto = function () {
    var tema = this.dati.tema;
    this.root.innerHTML = stileFont(tema) + '<div style="' + stiliContenitore(tema) + '">' +
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
      this.root.innerHTML = stileFont(tema) + '<div style="' + stiliContenitore(tema) + '">Carico le fermate disponibili…</div>';
      return;
    }
    // Città, orario di andata e prezzo, come nel sito.
    var opzOptions = this.opzioni.map(function (o) {
      return '<option value="' + escapeHtml(o.fermataId) + '">' + escapeHtml(o.fermataCitta) + ' (' + escapeHtml(o.fermataOrario || 'orario da definire') + ') — ' + euro.format(o.prezzoEffettivo) + '</option>';
    }).join('');
    var stileEtichetta = 'display:block;margin:0 0 4px;font-size:' + (tema.tipografia.dimensioneTestoPx * 0.85) + 'px;color:' + tema.colori.testoSecondario + ';';

    this.root.innerHTML = stileFont(tema) + '<form id="modulo" style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:700;margin:0 0 12px;">Completa la prenotazione</p>' +
      '<label for="in-fermata" style="' + stileEtichetta + '">Fermata di partenza</label>' +
      '<select id="in-fermata" style="' + stiliInput(tema) + '">' + opzOptions + '</select>' +
      campo(tema, 'in-passeggeri', 'Passeggeri', 'number', 'min="1" max="20" required', '1') +
      titoletto(tema, 'I tuoi dati') +
      campo(tema, 'in-nome', 'Nome', 'text', 'autocomplete="given-name" required') +
      campo(tema, 'in-cognome', 'Cognome', 'text', 'autocomplete="family-name" required') +
      campo(tema, 'in-email', 'Email', 'email', 'autocomplete="email" required') +
      campo(tema, 'in-telefono', 'Telefono', 'tel', 'autocomplete="tel" minlength="4" required') +
      '<div id="altri-passeggeri"></div>' +
      testoErrore() +
      '<button type="submit" style="' + stiliPulsante(tema) + '">Conferma prenotazione</button>' +
      '</form>';

    // Nome e cognome di ogni passeggero oltre a chi prenota: il server li
    // chiede sempre, e senza le prenotazioni per più persone fallivano.
    // Quando cambia il numero, quello già scritto resta.
    var contenitore = this.root.querySelector('#altri-passeggeri');
    var campoPasseggeri = this.root.querySelector('#in-passeggeri');
    function aggiornaAltri() {
      var n = Math.min(20, Math.max(1, parseInt(campoPasseggeri.value, 10) || 1));
      var scritti = {};
      contenitore.querySelectorAll('input').forEach(function (i) { scritti[i.id] = i.value; });
      var html = '';
      for (var p = 2; p <= n; p++) {
        html += titoletto(tema, 'Passeggero ' + p) +
          campo(tema, 'in-p' + p + '-nome', 'Nome', 'text', 'required', scritti['in-p' + p + '-nome']) +
          campo(tema, 'in-p' + p + '-cognome', 'Cognome', 'text', 'required', scritti['in-p' + p + '-cognome']);
      }
      contenitore.innerHTML = html;
    }
    campoPasseggeri.addEventListener('input', aggiornaAltri);

    this.alInvio(function () {
      var fermataId = self.root.querySelector('#in-fermata').value;
      var opzioneScelta = self.opzioni.filter(function (o) { return o.fermataId === fermataId; })[0];
      var passeggeri = Math.min(20, Math.max(1, parseInt(campoPasseggeri.value, 10) || 1));
      var partecipanti = [];
      for (var p = 2; p <= passeggeri; p++) {
        partecipanti.push({ nome: self.valore('in-p' + p + '-nome'), cognome: self.valore('in-p' + p + '-cognome') });
      }
      var corpo = {
        eventoId: self.dati.evento.id,
        tragittoId: opzioneScelta ? opzioneScelta.tragittoId : undefined,
        fermataId: fermataId,
        passeggeri: passeggeri,
        tipoPagamento: 'COMPLETO',
        metodoPagamento: 'DA_CONCORDARE',
        cliente: {
          nome: self.valore('in-nome'),
          cognome: self.valore('in-cognome'),
          email: self.valore('in-email'),
          telefono: self.valore('in-telefono'),
        },
        partecipanti: partecipanti,
      };
      return self.chiamata('POST', '/api/public/widget/' + encodeURIComponent(self.widgetId) + '/prenota', corpo, true)
        .then(function (r) {
          self.prenotazioneFatta = r;
          self.vista = 'conferma';
          self.render();
        });
    });
  };

  WidgetApp.prototype.renderConferma = function () {
    var tema = this.dati.tema;
    var pnr = this.prenotazioneFatta ? this.prenotazioneFatta.pnr : '';
    this.root.innerHTML = stileFont(tema) + '<div style="' + stiliContenitore(tema) + '">' +
      '<p style="font-weight:800;font-size:' + tema.tipografia.dimensioneTitoloPx + 'px;margin:0 0 8px;">✓ Prenotazione confermata</p>' +
      '<p style="color:' + tema.colori.testoSecondario + ';font-size:' + tema.tipografia.dimensioneTestoPx + 'px;">Il tuo codice è <b>' + escapeHtml(pnr) + '</b>. Ti abbiamo mandato la conferma via email; il biglietto con il numero del bus arriva via email prima della partenza.</p>' +
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
