import { useEffect, useId, useState } from 'react';
import { useParams } from 'react-router-dom';
import { whiteLabelApi, type WhiteLabelPubblica } from '../api/whiteLabel';
import { clienteAuthApi } from '../api/clienteAuth';
import { salvaTokenCliente, clienteLoggato } from '../features/clienteSessione';
import { WhiteLabelPreview } from '../features/white-label/WhiteLabelPreview';
import { applicaTitoloPagina, caricaFontTema, piePagina, sfondoPagina, stileCampo, stilePulsante, stileRiquadro, variabiliTema } from '../features/white-label/tema';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';
import { BundleFlusso } from '../features/bundle/BundleFlusso';
import { inizializzaMetaPixelWidget } from '../features/metaPixel';
import { inizializzaGA4Widget, tracciaPaginaGA4 } from '../features/googleAnalytics';
import { tracciaAcquistoRegistrato, valoreAcquisto } from '../features/tracciaAcquisto';
import { ConsensoWidget } from '../features/white-label/ConsensoWidget';

type Vista = 'caricamento' | 'errore' | 'vetrina' | 'auth' | 'login' | 'registrati' | 'registrati-fatto' | 'checkout' | 'bundle';

export function WidgetPubblicoPage() {
  const { publicWidgetId } = useParams<{ publicWidgetId: string }>();
  const [vista, setVista] = useState<Vista>('caricamento');
  const [erroreVista, setErroreVista] = useState('');
  const [dati, setDati] = useState<WhiteLabelPubblica | null>(null);
  const [eventoCompleto, setEventoCompleto] = useState<Evento | null>(null);

  // Font, titolo della scheda e icona del tema: appena arrivano i dati,
  // così la pagina sembra del cliente anche nella barra del browser.
  useEffect(() => {
    if (!dati) return;
    caricaFontTema(dati.tema);
    applicaTitoloPagina(dati.tema, dati.evento?.artista ?? dati.bundle?.nome ?? 'Prenota il tuo viaggio');
  }, [dati]);

  useEffect(() => {
    if (!publicWidgetId) return;
    whiteLabelApi.getPubblica(publicWidgetId)
      // Widget di un bundle: il flusso è lungo (eventi, fermate, dati), quindi
      // l'accesso si fa PRIMA, non in fondo — così niente si perde tra un
      // passaggio e l'altro. Il widget evento resta com'era.
      .then((d) => {
        setDati(d);
        setVista(d.bundle ? (clienteLoggato() ? 'bundle' : 'auth') : 'vetrina');
        // Pixel di INBUS + quello dell'organizzatore se presente, e GA4:
        // partono solo con il consenso chiesto da ConsensoWidget.
        inizializzaMetaPixelWidget(d.metaPixelId);
        inizializzaGA4Widget(() => tracciaPaginaGA4(window.location.pathname, document.title));
      })
      .catch((e) => { setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare questa pagina.'); setVista('errore'); });
  }, [publicWidgetId]);

  async function apriPrenotazione() {
    if (clienteLoggato()) await vaiAlCheckout();
    else setVista('auth');
  }

  async function vaiAlCheckout() {
    if (!dati) return;
    if (dati.bundle) { setVista('bundle'); return; }
    if (!dati.evento) return;
    setVista('caricamento');
    try {
      // Non la pagina pubblica del sito: l'evento può essere nascosto da OnWay e in vendita qui.
      const ev = await whiteLabelApi.evento(publicWidgetId!);
      setEventoCompleto(ev);
      setVista('checkout');
    } catch (e) {
      setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare i dettagli del viaggio.');
      setVista('errore');
    }
  }

  // Caricamento ed errore: già con i colori del cliente se li conosciamo
  // (la prima volta sono quelli di serie, non c'è ancora il tema).
  if (vista === 'caricamento') return <Sfondo tema={dati?.tema}><p style={{ color: dati?.tema.colori.testoSecondario ?? '#a99fc2' }}>Carico…</p></Sfondo>;
  if (vista === 'errore') return <Sfondo tema={dati?.tema}><p style={{ color: dati?.tema.colori.testoSecondario ?? '#a99fc2' }}>{erroreVista}</p></Sfondo>;
  if (!dati || !publicWidgetId) return null;

  if (vista === 'bundle' && dati.bundle && publicWidgetId) {
    const b = dati.bundle;
    return (
      <div style={{ minHeight: '100vh', padding: '40px 20px', ...sfondoPagina(dati.tema), ...variabiliTema(dati.tema) }}>
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
          <ConsensoWidget tema={dati.tema} />
        </div>
      </div>
    );
  }

  if (vista === 'checkout' && eventoCompleto) {
    return (
      <div style={{ minHeight: '100vh', padding: '40px 20px', ...sfondoPagina(dati.tema) }}>
        <div style={{ maxWidth: Math.max(dati.tema.stile.larghezzaPx, 420), margin: '0 auto' }}>
          <CheckoutForm evento={eventoCompleto} publicWidgetId={publicWidgetId} temaWhiteLabel={dati.tema} />
          <PiePagina tema={dati.tema} />
          <ConsensoWidget tema={dati.tema} />
        </div>
      </div>
    );
  }

  return (
    <Sfondo tema={dati.tema} conPiePagina={vista !== 'vetrina' || !dati.tema.elementiVisibili.informazioni}>
      {vista === 'vetrina' && (
        dati.evento && <WhiteLabelPreview tema={dati.tema} evento={dati.evento} larghezza={dati.tema.stile.larghezzaPx} onCtaClick={dati.attiva ? apriPrenotazione : undefined} />
      )}
      {vista === 'auth' && <SceltaAuth tema={dati.tema} onLogin={() => setVista('login')} onRegistrati={() => setVista('registrati')} />}
      {vista === 'login' && <FormLogin tema={dati.tema} onFatto={vaiAlCheckout} />}
      {vista === 'registrati' && <FormRegistrati tema={dati.tema} onFatto={() => setVista('registrati-fatto')} />}
      {vista === 'registrati-fatto' && (
        <Riquadro tema={dati.tema}>
          <p>✓ Controlla la tua email per confermare l'account, poi accedi qui sotto per completare la prenotazione.</p>
          <PulsanteSecondario tema={dati.tema} onClick={() => setVista('login')}>Accedi ora</PulsanteSecondario>
        </Riquadro>
      )}
      <ConsensoWidget tema={dati.tema} />
    </Sfondo>
  );
}

/** Lo sfondo di tutta la pagina: colore o immagine del tema (di serie
 *  quello scuro di OnWay finché il tema non è arrivato). La nota in fondo
 *  si mostra qui solo quando non la mostra già il riquadro (la vetrina ce
 *  l'ha dentro, altrimenti si leggerebbe due volte). */
function Sfondo({ tema, conPiePagina = true, children }: { tema?: WhiteLabelPubblica['tema']; conPiePagina?: boolean; children: React.ReactNode }) {
  const stile = tema ? { ...sfondoPagina(tema), ...variabiliTema(tema) } : { background: '#14121f' };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, ...stile }}>
      {children}
      {tema && conPiePagina && <PiePagina tema={tema} />}
    </div>
  );
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
