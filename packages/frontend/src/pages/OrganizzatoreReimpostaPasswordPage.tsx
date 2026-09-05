import { useState } from 'react';
import { LogoOnWay } from '../features/LogoOnWay';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { organizzatoriApi } from '../api/organizzatori';
import { ErroreApi } from '../api/client';
import { erroreValidazionePassword } from '../features/validazionePassword';
import '../styles/promoter.css';

export function OrganizzatoreReimpostaPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [fatto, setFatto] = useState(false);

  async function invia() {
    setErrore('');
    const erroreValidazione = erroreValidazionePassword(password, conferma);
    if (erroreValidazione) { setErrore(erroreValidazione); return; }
    if (!token) return;
    setCaricamento(true);
    try {
      await organizzatoriApi.resetPassword(token, password);
      setFatto(true);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Link scaduto o non valido.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="pagina-partner">
      <header>
        <div className="logo"><LogoOnWay come="testo" /><small>organizzatore</small></div>
        <Link className="back-link" to="/organizzatore">← Torna al login</Link>
      </header>
      <main>
        <h1 className="page-title">Reimposta password</h1>
        <div className="login-box">
          {fatto ? (
            <>
              <p>✓ Fatto — la tua password è stata cambiata.</p>
              <button className="btn btn-primary" onClick={() => navigate('/organizzatore')}>Vai al login</button>
            </>
          ) : (
            <>
              <p>Scegli una nuova password.</p>
              <input type="password" placeholder="Nuova password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <input type="password" placeholder="Ripeti la password" value={conferma} onChange={(e) => setConferma(e.target.value)} />
              {errore && <p className="errore">{errore}</p>}
              <button className="btn btn-primary" onClick={invia} disabled={caricamento}>{caricamento ? 'Salvataggio...' : 'Salva nuova password'}</button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
