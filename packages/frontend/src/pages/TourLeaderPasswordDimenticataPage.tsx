import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tourLeaderAuthApi } from '../api/tourLeaderAuth';

export function TourLeaderPasswordDimenticataPage() {
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setCaricamento(true);
    try {
      await tourLeaderAuthApi.richiediReset(email);
      setInviato(true);
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 20, fontFamily: "'Poppins',sans-serif" }}>
      <form onSubmit={invia} style={{ background: '#fff', border: '1px solid #e3e5ea', borderRadius: 12, padding: 32, width: '100%', maxWidth: 360, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <h1 style={{ color: '#1f2430', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>IN<span style={{ color: '#2563eb' }}>BUS</span></h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Scrivi la tua email: se corrisponde a un account, ti mandiamo un link per sceglierne una nuova.</p>

        {inviato ? (
          <p style={{ fontSize: 13.5, color: '#1f2430' }}>✓ Controlla la posta (anche lo spam).</p>
        ) : (
          <>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e5ea', background: '#f3f4f6', color: '#1f2430', fontSize: 15, marginBottom: 14 }}
            />
            <button type="submit" disabled={caricamento} style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              {caricamento ? 'Invio...' : 'Invia link'}
            </button>
          </>
        )}
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/scansione/accedi" style={{ fontSize: 12.5, color: '#6b7280' }}>← Torna al login</Link>
        </p>
      </form>
    </div>
  );
}
