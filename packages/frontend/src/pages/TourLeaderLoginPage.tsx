import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#14121f', padding: 20 }}>
      <form onSubmit={accedi} style={{ background: '#1c1930', borderRadius: 16, padding: 32, width: '100%', maxWidth: 360 }}>
        <h1 style={{ color: '#fff', fontSize: 22, marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>INBUS</h1>
        <p style={{ color: '#a99fc2', fontSize: 14, marginBottom: 24 }}>Accesso tour leader — controllo biglietti</p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: '#a99fc2', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #35304a', background: '#100f1c', color: '#fff', fontSize: 15 }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: '#a99fc2', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #35304a', background: '#100f1c', color: '#fff', fontSize: 15 }}
          />
        </div>

        {errore && <p style={{ color: '#ff3d7a', fontSize: 13, marginBottom: 14 }}>{errore}</p>}

        <button
          type="submit"
          disabled={caricamento}
          style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#5b8dff', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          {caricamento ? 'Accesso...' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
