import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { tourLeaderAuthApi } from '../api/tourLeaderAuth';

/** Login del tour leader — separato dall'accesso amministratore, porta
 *  solo all'app di scansione biglietti, non al gestionale. */
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 20, fontFamily: "'Poppins',sans-serif" }}>
      <form onSubmit={accedi} style={{ background: '#fff', border: '1px solid #e3e5ea', borderRadius: 12, padding: 32, width: '100%', maxWidth: 360, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <h1 style={{ color: '#1f2430', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>IN<span style={{ color: '#2563eb' }}>BUS</span></h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>Accesso tour leader — controllo biglietti</p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e5ea', background: '#f3f4f6', color: '#1f2430', fontSize: 15 }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e5ea', background: '#f3f4f6', color: '#1f2430', fontSize: 15 }}
          />
        </div>

        {errore && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{errore}</p>}

        <button
          type="submit"
          disabled={caricamento}
          style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          {caricamento ? 'Accesso...' : 'Accedi'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/scansione/password-dimenticata" style={{ fontSize: 12.5, color: '#6b7280' }}>Password dimenticata?</Link>
        </p>
      </form>
    </div>
  );
}
