import { useState } from 'react';
import { Link } from 'react-router-dom';
import { promoterApi } from '../api/promoter';
import '../styles/promoter.css';

export function PromoterPasswordDimenticataPage() {
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  async function invia() {
    setCaricamento(true);
    try {
      await promoterApi.richiediReset(email);
      setInviato(true);
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <>
      <header>
        <div className="logo">IN<span>BUS</span><small>promoter</small></div>
        <Link className="back-link" to="/promoter">← Torna al login</Link>
      </header>
      <main>
        <h1 className="page-title">Password dimenticata?</h1>
        <p className="page-sub">Scrivi la tua email: se corrisponde a un account, ti mandiamo un link per sceglierne una nuova.</p>
        <div className="login-box">
          {inviato ? (
            <p>✓ Controlla la posta (anche lo spam).</p>
          ) : (
            <>
              <input type="email" placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn btn-primary" onClick={invia} disabled={caricamento}>{caricamento ? 'Invio...' : 'Invia link'}</button>
            </>
          )}
        </div>
      </main>
    </>
  );
}
