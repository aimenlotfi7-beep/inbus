import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { whiteLabelApi, type WhiteLabelPubblica } from '../api/whiteLabel';
import { eventiApi } from '../api/eventi';
import { clienteAuthApi } from '../api/clienteAuth';
import { salvaTokenCliente, clienteLoggato } from '../features/clienteSessione';
import { WhiteLabelPreview } from '../features/white-label/WhiteLabelPreview';
import { CheckoutForm } from '../features/checkout/CheckoutForm';
import { ErroreApi } from '../api/client';
import type { Evento } from '../api/types';

type Vista = 'caricamento' | 'errore' | 'vetrina' | 'auth' | 'login' | 'registrati' | 'registrati-fatto' | 'checkout';

export function WidgetPubblicoPage() {
  const { publicWidgetId } = useParams<{ publicWidgetId: string }>();
  const [vista, setVista] = useState<Vista>('caricamento');
  const [erroreVista, setErroreVista] = useState('');
  const [dati, setDati] = useState<WhiteLabelPubblica | null>(null);
  const [eventoCompleto, setEventoCompleto] = useState<Evento | null>(null);

  useEffect(() => {
    if (!publicWidgetId) return;
    whiteLabelApi.getPubblica(publicWidgetId)
      .then((d) => { setDati(d); setVista('vetrina'); })
      .catch((e) => { setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare questa pagina.'); setVista('errore'); });
  }, [publicWidgetId]);

  async function apriPrenotazione() {
    if (clienteLoggato()) await vaiAlCheckout();
    else setVista('auth');
  }

  async function vaiAlCheckout() {
    if (!dati) return;
    setVista('caricamento');
    try {
      const ev = await eventiApi.getBySlug(dati.evento.slug);
      setEventoCompleto(ev);
      setVista('checkout');
    } catch (e) {
      setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare i dettagli del viaggio.');
      setVista('errore');
    }
  }

  if (vista === 'caricamento') return <Sfondo colore="#14121f"><p style={{ color: '#a99fc2' }}>Carico...</p></Sfondo>;
  if (vista === 'errore') return <Sfondo colore="#14121f"><p style={{ color: '#a99fc2' }}>{erroreVista}</p></Sfondo>;
  if (!dati || !publicWidgetId) return null;

  if (vista === 'checkout' && eventoCompleto) {
    return (
      <div style={{ minHeight: '100vh', background: dati.tema.colori.sfondo, padding: '40px 20px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <CheckoutForm evento={eventoCompleto} publicWidgetId={publicWidgetId} temaColori={dati.tema.colori} />
        </div>
      </div>
    );
  }

  return (
    <Sfondo colore={dati.tema.colori.sfondo}>
      {vista === 'vetrina' && (
        <WhiteLabelPreview tema={dati.tema} evento={dati.evento} larghezza={400} onCtaClick={dati.attiva ? apriPrenotazione : undefined} />
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
    </Sfondo>
  );
}

function Sfondo({ colore, children }: { colore: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colore, padding: 24 }}>
      {children}
    </div>
  );
}

function Riquadro({ tema, children }: { tema: WhiteLabelPubblica['tema']; children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%', maxWidth: 400, boxSizing: 'border-box', background: tema.colori.superficie,
      borderRadius: tema.stile.borderRadiusPx, border: `1px solid ${tema.colori.bordi}`, padding: tema.stile.spaziaturaPx,
      fontFamily: tema.tipografia.font, color: tema.colori.testoPrincipale,
    }}>
      {children}
    </div>
  );
}

function Campo({ tema, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { tema: WhiteLabelPubblica['tema'] }) {
  return (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: Math.min(tema.stile.borderRadiusPx, 8),
        border: `1px solid ${tema.colori.bordi}`, background: 'transparent', color: tema.colori.testoPrincipale,
        fontFamily: tema.tipografia.font, fontSize: tema.tipografia.dimensioneTestoPx, marginBottom: 8,
      }}
    />
  );
}

function PulsantePrincipale({ tema, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tema: WhiteLabelPubblica['tema'] }) {
  const s = tema.stile, c = tema.colori;
  return (
    <button
      {...props}
      style={{
        height: s.altezzaPulsantePx,
        borderRadius: s.stilePulsanti === 'arrotondato' ? 999 : s.borderRadiusPx,
        background: s.stilePulsanti === 'contorno' ? 'transparent' : c.cta,
        color: s.stilePulsanti === 'contorno' ? c.cta : c.testoCta,
        border: s.stilePulsanti === 'contorno' ? `1.5px solid ${c.cta}` : 'none',
        fontFamily: tema.tipografia.font, fontWeight: 700, fontSize: tema.tipografia.dimensioneTestoPx,
        width: '100%', cursor: 'pointer',
      }}
    />
  );
}
function PulsanteSecondario({ tema, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tema: WhiteLabelPubblica['tema'] }) {
  return (
    <button
      {...props}
      style={{
        height: tema.stile.altezzaPulsantePx, borderRadius: tema.stile.borderRadiusPx, background: 'transparent',
        color: tema.colori.testoSecondario, border: `1px solid ${tema.colori.bordi}`, fontFamily: tema.tipografia.font,
        fontWeight: 600, fontSize: tema.tipografia.dimensioneTestoPx, width: '100%', cursor: 'pointer', marginTop: 8,
      }}
    />
  );
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
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Accedi</p>
      <Campo tema={tema} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo tema={tema} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <TestoErrore>{errore}</TestoErrore>
      <PulsantePrincipale tema={tema} onClick={invia} disabled={caricamento}>{caricamento ? 'Accesso...' : 'Accedi'}</PulsantePrincipale>
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
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Crea un account</p>
      <Campo tema={tema} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo tema={tema} placeholder="Cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} />
      <Campo tema={tema} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo tema={tema} placeholder="Telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      <Campo tema={tema} type="date" placeholder="Data di nascita" value={dataNascita} onChange={(e) => setDataNascita(e.target.value)} />
      <Campo tema={tema} type="password" placeholder="Password (almeno 8 caratteri)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <TestoErrore>{errore}</TestoErrore>
      <PulsantePrincipale tema={tema} onClick={invia} disabled={caricamento}>{caricamento ? 'Creazione...' : 'Crea account'}</PulsantePrincipale>
    </Riquadro>
  );
}
