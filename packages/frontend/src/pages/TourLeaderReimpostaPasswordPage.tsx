import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { tourLeaderAuthApi } from '../api/tourLeaderAuth';
import { erroreValidazionePassword } from '../features/validazionePassword';

export function TourLeaderReimpostaPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
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
    if (!token) return;
    setCaricamento(true);
    try {
      await tourLeaderAuthApi.resetPassword(token, password);
      setFatto(true);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Link scaduto o non valido.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 20, fontFamily: "'Poppins',sans-serif" }}>
      <div style={{ background: '#fff', border: '1px solid #e3e5ea', borderRadius: 12, padding: 32, width: '100%', maxWidth: 360, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <h1 style={{ color: '#1f2430', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>IN<span style={{ color: '#2563eb' }}>BUS</span></h1>
        {fatto ? (
          <>
            <p style={{ fontSize: 13.5, color: '#1f2430', margin: '14px 0' }}>✓ Fatto — la tua password è stata cambiata.</p>
            <button onClick={() => navigate('/scansione/accedi')} style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Vai al login
            </button>
          </>
        ) : (
          <form onSubmit={invia}>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Scegli una nuova password.</p>
            <input type="password" placeholder="Nuova password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e5ea', background: '#f3f4f6', color: '#1f2430', fontSize: 15, marginBottom: 10 }} />
            <input type="password" placeholder="Ripeti la password" value={conferma} onChange={(e) => setConferma(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e5ea', background: '#f3f4f6', color: '#1f2430', fontSize: 15, marginBottom: 14 }} />
            {errore && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{errore}</p>}
            <button type="submit" disabled={caricamento} style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              {caricamento ? 'Salvataggio...' : 'Salva nuova password'}
            </button>
          </form>
        )}
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/scansione/accedi" style={{ fontSize: 12.5, color: '#6b7280' }}>← Torna al login</Link>
        </p>
      </div>
    </div>
  );
}
