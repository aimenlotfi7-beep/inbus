import { useEffect, useId, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { whiteLabelApi, type CardEvento, type WhiteLabelPubblica } from '../api/whiteLabel';
import { clienteAuthApi } from '../api/clienteAuth';
import { salvaTokenCliente, clienteLoggato } from '../features/clienteSessione';
import { WhiteLabelPreview } from '../features/white-label/WhiteLabelPreview';
import { ElencoEventi } from '../features/white-label/ElencoEventi';
import { applicaTitoloPagina, caricaFontTema, piePagina, sfondoPagina, stileCampo, stilePulsante, stileRiquadro, titoloElenco, variabiliTema } from '../features/white-label/tema';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { BundleFlusso } from '../features/bundle/BundleFlusso';
import { inizializzaMetaPixelWidget } from '../features/metaPixel';
import { inizializzaGA4Widget, tracciaPaginaGA4 } from '../features/googleAnalytics';
import { tracciaAcquistoRegistrato, valoreAcquisto } from '../features/tracciaAcquisto';
import { ConsensoWidget } from '../features/white-label/ConsensoWidget';

type Vista = 'caricamento' | 'errore' | 'elenco' | 'vetrina' | 'auth' | 'login' | 'registrati' | 'registrati-fatto' | 'checkout' | 'bundle';

export function WidgetPubblicoPage() {
  const { publicWidgetId } = useParams<{ publicWidgetId: string }>();
  // ?incorporato=1: la pagina è dentro il sito del cliente, nella finestra
  // creata dal codice da incollare (public/embed.js). Niente sfondo di
  // pagina né altezza a schermo intero: solo il riquadro, sopra lo sfondo
  // del sito che la ospita. ?evento=slug: il link o il codice di un evento
  // solo di una White Label che ne ha più d'uno.
  const [parametri] = useSearchParams();
  const incorporato = parametri.get('incorporato') === '1';
  const eventoDelLink = parametri.get('evento');
  const [vista, setVista] = useState<Vista>('caricamento');
  const [erroreVista, setErroreVista] = useState('');
  const [dati, setDati] = useState<WhiteLabelPubblica | null>(null);
  // L'evento che si sta prenotando: l'unico, quello del link o quello scelto tra le card.
  const [scelto, setScelto] = useState<CardEvento | null>(null);
  const [eventoCompleto, setEventoCompleto] = useState<Evento | null>(null);

  useFinestraIncorporata(incorporato, vista);

  // Font, titolo della scheda e icona del tema: appena arrivano i dati,
  // così la pagina sembra del cliente anche nella barra del browser.
  useEffect(() => {
    if (!dati) return;
    caricaFontTema(dati.tema);
    applicaTitoloPagina(dati.tema, scelto?.artista ?? dati.bundle?.nome ?? (dati.eventi.length > 1 ? titoloElenco(dati.tema) : 'Prenota il tuo viaggio'));
  }, [dati, scelto]);

  useEffect(() => {
    if (!publicWidgetId) return;
    whiteLabelApi.getPubblica(publicWidgetId, eventoDelLink)
      // Widget di un bundle: il flusso è lungo (eventi, fermate, dati), quindi
      // l'accesso si fa PRIMA, non in fondo — così niente si perde tra un
      // passaggio e l'altro. Con gli eventi: dritti alla vetrina se ce n'è
      // uno solo (o il link ne indica uno), altrimenti le card.
      .then((d) => {
        setDati(d);
        setScelto(d.evento);
        setVista(d.bundle ? (clienteLoggato() ? 'bundle' : 'auth') : d.evento ? 'vetrina' : 'elenco');
        // Pixel di INBUS + quello dell'organizzatore se presente, e GA4:
        // partono solo con il consenso chiesto da ConsensoWidget. Dentro il
        // sito del cliente niente tracciamento né banner: lì i cookie li
        // gestisce il sito che ospita (come faceva il vecchio codice).
        if (!incorporato) {
          inizializzaMetaPixelWidget(d.metaPixelId);
          inizializzaGA4Widget(() => tracciaPaginaGA4(window.location.pathname, document.title));
        }
      })
      .catch((e) => { setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare questa pagina.'); setVista('errore'); });
  }, [publicWidgetId, incorporato, eventoDelLink]);

  async function apriPrenotazione(evento: CardEvento | null = scelto) {
    if (clienteLoggato()) await vaiAlCheckout(evento);
    else setVista('auth');
  }

  /** Dalle card: la card ha già data, luogo e prezzo, quindi si va dritti alla prenotazione. */
  function scegliEvento(eventoId: string) {
    const evento = dati?.eventi.find((e) => e.id === eventoId) ?? null;
    setScelto(evento);
    apriPrenotazione(evento);
  }

  // Con più eventi, da ogni passo si torna alle card; non dal link o dal
  // codice di un evento solo (il cliente lo mette nella pagina di quell'evento).
  const conElenco = !!dati && !dati.bundle && dati.eventi.length > 1 && !(eventoDelLink && dati.evento);
  function tornaAllElenco() {
    setScelto(null);
    setEventoCompleto(null);
    setVista('elenco');
  }

  async function vaiAlCheckout(evento: CardEvento | null = scelto) {
    if (!dati) return;
    if (dati.bundle) { setVista('bundle'); return; }
    if (!evento) return;
    setVista('caricamento');
    try {
      // Non la pagina pubblica del sito: l'evento può essere nascosto da OnWay e in vendita qui.
      const ev = await whiteLabelApi.evento(publicWidgetId!, evento.id);
      setEventoCompleto(ev);
      setVista('checkout');
    } catch (e) {
      setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare i dettagli del viaggio.');
      setVista('errore');
    }
  }

  // Caricamento ed errore: già con i colori del cliente se li conosciamo
  // (la prima volta sono quelli di serie, non c'è ancora il tema).
  if (vista === 'caricamento') return <Sfondo tema={dati?.tema} incorporato={incorporato}><p style={{ color: dati?.tema.colori.testoSecondario ?? '#a99fc2' }}>Carico…</p></Sfondo>;
  if (vista === 'errore') return <Sfondo tema={dati?.tema} incorporato={incorporato}><p style={{ color: dati?.tema.colori.testoSecondario ?? '#a99fc2' }}>{erroreVista}</p></Sfondo>;
  if (!dati || !publicWidgetId) return null;

  // Pagina intera: sfondo del tema e almeno l'altezza dello schermo. Dentro
  // il sito del cliente: nessuno sfondo e l'altezza del contenuto, con un
  // filo di margine per le ombre dei riquadri. Sempre con le variabili del
  // tema e la classe tema-wl: la prenotazione (CheckoutForm, BundleFlusso)
  // usa i fogli di stile del sito e lì prende i colori del cliente
  // (checkout.css, "PRENOTAZIONE DENTRO LA WHITE LABEL").
  const pagina: React.CSSProperties = incorporato
    ? { padding: 6, ...variabiliTema(dati.tema) }
    : { minHeight: '100vh', padding: '40px 20px', ...sfondoPagina(dati.tema), ...variabiliTema(dati.tema) };

  if (vista === 'bundle' && dati.bundle && publicWidgetId) {
    const b = dati.bundle;
    return (
      <div className="tema-wl" style={pagina}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {!dati.attiva ? (
            <Riquadro tema={dati.tema}><p>Questa pagina non accetta più nuovi acquisti.</p></Riquadro>
          ) : (
            <BundleFlusso
              bundle={b}
              tema={{ superficie: dati.tema.colori.superficie, testo: dati.tema.colori.testoPrincipale, bordi: dati.tema.colori.bordi }}
              caricaEvento={(ev) => whiteLabelApi.evento(publicWidgetId, ev.id)}
              caricaOpzioni={(eventoId, servizioId) => whiteLabelApi.opzioniPartenza(publicWidgetId, eventoId, servizioId)}
              mostraSceltaAcconto
              testoConferma="Conferma l'acquisto"
              onConferma={async ({ righe, passeggeri, cliente, partecipanti, tipoPagamento }) => {
                const risultato = await whiteLabelApi.ordineBundle(publicWidgetId, righe.map(({ evento, opzione }) => ({
                  eventoId: evento.id, tragittoId: opzione.tragittoId, fermataId: opzione.fermataId, passeggeri,
                  // Nessun pagamento online reale ancora: non registrare "Carta".
                  tipoPagamento, metodoPagamento: 'DA_CONCORDARE', cliente, partecipanti,
                })));
                // Stesso tracciamento del carrello del sito (prima il bundle del widget non ne mandava nessuno).
                tracciaAcquistoRegistrato({ valore: valoreAcquisto(risultato.prenotazioni), codice: risultato.ordine?.id ?? risultato.prenotazioni[0]?.pnr ?? '', nome: b.nome });
                return { pnr: risultato.prenotazioni.map((p) => p.pnr) };
              }}
            />
          )}
          {!incorporato && <ConsensoWidget tema={dati.tema} />}
        </div>
      </div>
    );
  }

  if (vista === 'checkout' && eventoCompleto) {
    const larghezza = Math.max(dati.tema.stile.larghezzaPx, 420);
    return (
      <div className="tema-wl" style={pagina}>
        {conElenco && <div style={{ maxWidth: larghezza, margin: '0 auto 10px' }}><TornaAllElenco tema={dati.tema} onClick={tornaAllElenco} /></div>}
        {/* Nel riquadro del tema, come vetrina e accesso: i testi della
            prenotazione sono pensati per il colore dei riquadri, non per lo
            sfondo della pagina. */}
        <div style={{ ...stileRiquadro(dati.tema), maxWidth: larghezza, margin: '0 auto' }}>
          <CheckoutForm evento={eventoCompleto} publicWidgetId={publicWidgetId} temaWhiteLabel={dati.tema} />
          <PiePagina tema={dati.tema} />
          {!incorporato && <ConsensoWidget tema={dati.tema} />}
        </div>
      </div>
    );
  }

  return (
    <Sfondo tema={dati.tema} incorporato={incorporato} conPiePagina={vista !== 'vetrina' || !dati.tema.elementiVisibili.informazioni}>
      {conElenco && vista !== 'elenco' && (
        <div style={{ width: '100%', maxWidth: dati.tema.stile.larghezzaPx }}><TornaAllElenco tema={dati.tema} onClick={tornaAllElenco} /></div>
      )}
      {vista === 'elenco' && (dati.eventi.length > 0 ? (
        <>
          <ElencoEventi tema={dati.tema} eventi={dati.eventi} onScegli={dati.attiva ? scegliEvento : undefined} senzaIntestazione={incorporato} />
          {!dati.attiva && <Riquadro tema={dati.tema}><p style={{ margin: 0 }}>Questa pagina non accetta più nuove prenotazioni.</p></Riquadro>}
        </>
      ) : (
        <Riquadro tema={dati.tema}>
          <p style={{ margin: 0, textAlign: 'center' }}>Al momento non ci sono viaggi in vendita. Torna a trovarci presto.</p>
        </Riquadro>
      ))}
      {vista === 'vetrina' && (
        scelto && <WhiteLabelPreview tema={dati.tema} evento={scelto} larghezza={dati.tema.stile.larghezzaPx} onCtaClick={dati.attiva ? () => apriPrenotazione() : undefined} />
      )}
      {vista === 'auth' && <SceltaAuth tema={dati.tema} onLogin={() => setVista('login')} onRegistrati={() => setVista('registrati')} />}
      {vista === 'login' && <FormLogin tema={dati.tema} onFatto={() => vaiAlCheckout()} />}
      {vista === 'registrati' && <FormRegistrati tema={dati.tema} onFatto={() => setVista('registrati-fatto')} />}
      {vista === 'registrati-fatto' && (
        <Riquadro tema={dati.tema}>
          <p>✓ Controlla la tua email per confermare l'account, poi accedi qui sotto per completare la prenotazione.</p>
          <PulsanteSecondario tema={dati.tema} onClick={() => setVista('login')}>Accedi ora</PulsanteSecondario>
        </Riquadro>
      )}
      {!incorporato && <ConsensoWidget tema={dati.tema} />}
    </Sfondo>
  );
}

/** Lo sfondo di tutta la pagina: colore o immagine del tema (di serie
 *  quello scuro di OnWay finché il tema non è arrivato). La nota in fondo
 *  si mostra qui solo quando non la mostra già il riquadro (la vetrina ce
 *  l'ha dentro, altrimenti si leggerebbe due volte). Dentro il sito del
 *  cliente niente sfondo e niente altezza a schermo intero: si vede il
 *  sito che ospita, e la finestra è alta quanto il contenuto. */
function Sfondo({ tema, incorporato = false, conPiePagina = true, children }: { tema?: WhiteLabelPubblica['tema']; incorporato?: boolean; conPiePagina?: boolean; children: React.ReactNode }) {
  const stile: React.CSSProperties = incorporato
    ? { padding: 6, ...(tema ? variabiliTema(tema) : {}) }
    : { minHeight: '100vh', justifyContent: 'center', padding: 24, ...(tema ? { ...sfondoPagina(tema), ...variabiliTema(tema) } : { background: '#14121f' }) };
  return (
    <div className="tema-wl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, ...stile }}>
      {children}
      {tema && conPiePagina && <PiePagina tema={tema} />}
    </div>
  );
}

/** Dentro il sito del cliente (codice da incollare, public/embed.js) la
 *  pagina vive in una finestra: sfondo trasparente al posto di quello del
 *  sito OnWay, e a ogni cambio di altezza lo dice alla pagina che la
 *  ospita, che allarga o stringe la finestra (niente barre di
 *  scorrimento). A ogni passo nuovo chiede di riportarla in vista. */
function useFinestraIncorporata(incorporato: boolean, vista: Vista) {
  useEffect(() => {
    if (!incorporato) return;
    const { documentElement: html, body } = document;
    const prima = [html.style.background, body.style.background];
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    const radice = document.getElementById('root');
    let dimensioni: ResizeObserver | undefined;
    let modifiche: MutationObserver | undefined;
    if (radice && window.parent !== window) {
      // Due sorveglianze: i cambi di dimensione (immagini e font che
      // arrivano) e i cambi del contenuto (fermate caricate, passi della
      // prenotazione), che scattano anche quando il browser non ridisegna.
      dimensioni = new ResizeObserver(mandaAltezza);
      dimensioni.observe(radice);
      modifiche = new MutationObserver(mandaAltezza);
      modifiche.observe(radice, { childList: true, subtree: true, characterData: true });
      mandaAltezza();
    }
    return () => {
      dimensioni?.disconnect();
      modifiche?.disconnect();
      html.style.background = prima[0];
      body.style.background = prima[1];
    };
  }, [incorporato]);

  // A ogni schermata nuova l'altezza si manda subito, senza aspettare che il
  // browser ridisegni (ResizeObserver resta per i cambi dentro la stessa
  // schermata, come i passi della prenotazione).
  useEffect(() => {
    if (!incorporato || window.parent === window) return;
    mandaAltezza();
    window.parent.postMessage({ tipo: 'inbus-widget-passo' }, '*');
  }, [incorporato, vista]);
}

let ultimaAltezzaMandata = 0;
/** L'altezza del contenuto alla pagina che ospita (solo se è cambiata). */
function mandaAltezza() {
  const radice = document.getElementById('root');
  if (!radice || window.parent === window) return;
  const altezza = Math.ceil(radice.getBoundingClientRect().height);
  if (altezza === ultimaAltezzaMandata) return;
  ultimaAltezzaMandata = altezza;
  window.parent.postMessage({ tipo: 'inbus-widget-altezza', altezza }, '*');
}

/** La nota in fondo: quella scritta nel tema e, solo col marchio acceso, OnWay. */
function PiePagina({ tema }: { tema: WhiteLabelPubblica['tema'] }) {
  const nota = piePagina(tema);
  if (!nota) return null;
  return (
    <p style={{ margin: '14px 0 0', fontSize: tema.tipografia.dimensioneTestoPx * 0.8, color: tema.colori.testoSecondario, textAlign: 'center' }}>
      {nota}
    </p>
  );
}

/** "← Tutti i viaggi": con più eventi, da ogni passo si torna alle card. */
function TornaAllElenco({ tema, onClick }: { tema: WhiteLabelPubblica['tema']; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', color: tema.colori.testoSecondario,
        fontFamily: 'inherit', fontSize: tema.tipografia.dimensioneTestoPx * 0.9, fontWeight: 600,
      }}
    >
      ← Tutti i viaggi
    </button>
  );
}

function Riquadro({ tema, children }: { tema: WhiteLabelPubblica['tema']; children: React.ReactNode }) {
  return <div style={{ ...stileRiquadro(tema), width: '100%', maxWidth: tema.stile.larghezzaPx }}>{children}</div>;
}

/** Campo con l'etichetta sopra, non solo il testo grigio dentro: quello
 *  sparisce appena si scrive, e nei campi data il telefono non lo mostra
 *  proprio (la data di nascita restava un campo senza nome). */
function Campo({ tema, etichetta, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { tema: WhiteLabelPubblica['tema']; etichetta: string }) {
  const id = useId();
  return (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ display: 'block', margin: '0 0 4px', fontSize: tema.tipografia.dimensioneTestoPx * 0.85, color: tema.colori.testoSecondario }}>{etichetta}</label>
      <input id={id} {...props} style={stileCampo(tema)} />
    </div>
  );
}

/** Condizioni e privacy prima di creare l'account (l'account è lo stesso del sito). */
function NotaLegale({ tema }: { tema: WhiteLabelPubblica['tema'] }) {
  return (
    <p style={{ margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5, fontSize: tema.tipografia.dimensioneTestoPx * 0.8, color: tema.colori.testoSecondario }}>
      Creando l'account accetti le <a href="/pagina/termini" target="_blank" rel="noopener" style={{ color: 'inherit' }}>condizioni</a> e
      confermi di aver letto l'<a href="/pagina/privacy" target="_blank" rel="noopener" style={{ color: 'inherit' }}>informativa privacy</a>.
    </p>
  );
}

function PulsantePrincipale({ tema, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tema: WhiteLabelPubblica['tema'] }) {
  return <button {...props} style={stilePulsante(tema)} />;
}
function PulsanteSecondario({ tema, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tema: WhiteLabelPubblica['tema'] }) {
  return <button {...props} style={{ ...stilePulsante(tema, 'secondario'), marginTop: 8 }} />;
}
function TestoErrore({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p style={{ color: '#e05c5c', fontSize: 12, margin: '0 0 8px' }}>{children}</p>;
}

function SceltaAuth({ tema, onLogin, onRegistrati }: { tema: WhiteLabelPubblica['tema']; onLogin: () => void; onRegistrati: () => void }) {
  return (
    <Riquadro tema={tema}>
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Accedi o registrati per continuare</p>
      <PulsantePrincipale tema={tema} onClick={onLogin}>Ho già un account</PulsantePrincipale>
      <PulsanteSecondario tema={tema} onClick={onRegistrati}>Creo un account nuovo</PulsanteSecondario>
    </Riquadro>
  );
}

function FormLogin({ tema, onFatto }: { tema: WhiteLabelPubblica['tema']; onFatto: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  async function invia() {
    setCaricamento(true);
    setErrore('');
    try {
      const { token } = await clienteAuthApi.login(email, password);
      salvaTokenCliente(token);
      onFatto();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Accesso non riuscito.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <Riquadro tema={tema}>
      <form onSubmit={(e) => { e.preventDefault(); invia(); }}>
        <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Accedi</p>
        <Campo tema={tema} etichetta="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo tema={tema} etichetta="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <TestoErrore>{errore}</TestoErrore>
        <PulsantePrincipale tema={tema} type="submit" disabled={caricamento}>{caricamento ? 'Accesso…' : 'Accedi'}</PulsantePrincipale>
      </form>
    </Riquadro>
  );
}

function FormRegistrati({ tema, onFatto }: { tema: WhiteLabelPubblica['tema']; onFatto: () => void }) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  async function invia() {
    if (!dataNascita) { setErrore('Inserisci la data di nascita.'); return; }
    setCaricamento(true);
    setErrore('');
    try {
      await clienteAuthApi.registrati({ nome, cognome, email, telefono, password, dataNascita });
      onFatto();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Registrazione non riuscita.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <Riquadro tema={tema}>
      <form onSubmit={(e) => { e.preventDefault(); invia(); }}>
        <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Crea un account</p>
        <Campo tema={tema} etichetta="Nome" autoComplete="given-name" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo tema={tema} etichetta="Cognome" autoComplete="family-name" required value={cognome} onChange={(e) => setCognome(e.target.value)} />
        <Campo tema={tema} etichetta="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo tema={tema} etichetta="Telefono (facoltativo)" type="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Campo tema={tema} etichetta="Data di nascita" type="date" autoComplete="bday" required value={dataNascita} onChange={(e) => setDataNascita(e.target.value)} />
        <Campo tema={tema} etichetta="Password (almeno 8 caratteri)" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <TestoErrore>{errore}</TestoErrore>
        <PulsantePrincipale tema={tema} type="submit" disabled={caricamento}>{caricamento ? 'Creazione…' : 'Crea account'}</PulsantePrincipale>
        <NotaLegale tema={tema} />
      </form>
    </Riquadro>
  );
}
