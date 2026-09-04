import { useEffect, useState } from 'react';
import { authApi, type SessioneAdmin } from '../api/auth';
import { LogoOnWay } from '../features/LogoOnWay';
import { ErroreApi } from '../api/client';
import { erroreValidazionePassword } from '../features/validazionePassword';

type Vista = 'login' | 'richiedi-reset' | 'nuova-password';

export function AdminLogin({ onLogin, messaggioIniziale }: { onLogin: (sessione: SessioneAdmin) => void; messaggioIniziale?: string }) {
  const [vista, setVista] = useState<Vista>('login');
  const [tokenReset, setTokenReset] = useState('');

  // L'admin non usa react-router (pagina separata admin.html) — il
  // link nell'email arriva con il token nell'hash dell'URL, letto qui.
  useEffect(() => {
    const match = window.location.hash.match(/^#\/reimposta-password\/(.+)$/);
    if (match) { setTokenReset(match[1]); setVista('nuova-password'); }
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState(messaggioIniziale ?? '');
  const [caricamento, setCaricamento] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCaricamento(true);
    setErrore('');
    try {
      const { token, admin } = await authApi.loginAdmin(email, password);
      localStorage.setItem('inbus_admin_token', token);
      onLogin(admin);
    } catch (err) {
      setErrore(err instanceof ErroreApi ? err.message : 'Impossibile contattare il server');
    } finally {
      setCaricamento(false);
    }
  }

  if (vista === 'richiedi-reset') return <RichiediReset onIndietro={() => setVista('login')} />;
  if (vista === 'nuova-password') return <NuovaPassword token={tokenReset} onFatto={() => { window.location.hash = ''; setVista('login'); }} />;

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="logo"><LogoOnWay come="testo" freccia="mono" /> <small>gestionale</small></div>
        <p>Accedi con le tue credenziali di amministrazione.</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn btn-primary" type="submit" disabled={caricamento}>
          {caricamento ? 'Accesso...' : 'Accedi'}
        </button>
        {errore && <p className="error-msg">{errore}</p>}
        <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 12.5 }} onClick={() => setVista('richiedi-reset')}>
          Password dimenticata?
        </button>
      </form>
    </div>
  );
}

function RichiediReset({ onIndietro }: { onIndietro: () => void }) {
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setCaricamento(true);
    try {
      await authApi.richiediReset(email);
      setInviato(true);
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={invia}>
        <div className="logo"><LogoOnWay come="testo" freccia="mono" /> <small>gestionale</small></div>
        <p>Scrivi la tua email: se corrisponde a un account, ti mandiamo un link per scegliere una nuova password.</p>
        {inviato ? (
          <p style={{ fontSize: 13.5 }}>✓ Controlla la posta (anche lo spam).</p>
        ) : (
          <>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn btn-primary" type="submit" disabled={caricamento}>{caricamento ? 'Invio...' : 'Invia link'}</button>
          </>
        )}
        <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 12.5 }} onClick={onIndietro}>← Torna al login</button>
      </form>
    </div>
  );
}

function NuovaPassword({ token, onFatto }: { token: string; onFatto: () => void }) {
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [fatto, setFatto] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    const erroreValidazione = erroreValidazionePassword(password, conferma);
    if (erroreValidazione) { setErrore(erroreValidazione); return; }
    setCaricamento(true);
    try {
      await authApi.resetPassword(token, password);
      setFatto(true);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Link scaduto o non valido.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="logo"><LogoOnWay come="testo" freccia="mono" /> <small>gestionale</small></div>
        {fatto ? (
          <>
            <p style={{ fontSize: 13.5 }}>✓ Fatto — la tua password è stata cambiata.</p>
            <button className="btn btn-primary" onClick={onFatto}>Vai al login</button>
          </>
        ) : (
          <form onSubmit={invia}>
            <p>Scegli una nuova password.</p>
            <input type="password" placeholder="Nuova password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input type="password" placeholder="Ripeti la password" value={conferma} onChange={(e) => setConferma(e.target.value)} required />
            {errore && <p className="error-msg">{errore}</p>}
            <button className="btn btn-primary" type="submit" disabled={caricamento}>{caricamento ? 'Salvataggio...' : 'Salva nuova password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
