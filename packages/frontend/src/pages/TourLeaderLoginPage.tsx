import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { tourLeaderAuthApi } from '../api/tourLeaderAuth';
import { AuthShell } from '../features/AuthShell';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { CampoPassword } from '../features/CampoPassword';
import '../styles/account.css';
import '../styles/promoter.css';

/** Accesso del tour leader — separato da quello dell'amministratore:
 *  porta solo all'app di controllo dei biglietti, non al gestionale. */
export function TourLeaderLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const navigate = useNavigate();

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setCaricamento(true);
    try {
      await tourLeaderAuthApi.login(email, password);
      navigate('/scansione');
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Accesso non riuscito.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <AuthShell temaChiaro etichettaTipo="tour leader">
      <h1>Accesso tour leader</h1>
      <p className="auth-sottotitolo">Da qui apri la lista dei passeggeri e il controllo dei biglietti del tuo bus.</p>

      <form onSubmit={accedi}>
        <CampoTesto
          id="tl-email" etichetta="Email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <CampoPassword
          id="tl-password" etichetta="Password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          azione={<Link className="campo-etichetta-link" to="/scansione/password-dimenticata">Password dimenticata?</Link>}
        />

        {errore && <p className="avviso avviso-errore auth-avviso" role="alert">{errore}</p>}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
          {caricamento ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>
    </AuthShell>
  );
}
