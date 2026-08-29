import { useState } from 'react';
import { authApi, type SessioneAdmin } from '../api/auth';
import { ErroreApi } from '../api/client';

export function AdminLogin({ onLogin }: { onLogin: (sessione: SessioneAdmin) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
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

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="logo">IN<span>BUS</span> <small>gestionale</small></div>
        <p>Accedi con le tue credenziali di amministrazione.</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn btn-primary" type="submit" disabled={caricamento}>
          {caricamento ? 'Accesso...' : 'Accedi'}
        </button>
        {errore && <p className="error-msg">{errore}</p>}
      </form>
    </div>
  );
}
