import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clienteAuthApi, ErroreClienteAuth } from '../api/clienteAuth';
import { salvaTokenCliente } from '../features/clienteSessione';
import '../styles/account.css';

export function AccediPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState(searchParams.get('motivo') === 'scaduta' ? 'La tua sessione è scaduta — accedi di nuovo.' : '');
  const [caricamento, setCaricamento] = useState(false);
  const [inviandoVerifica, setInviandoVerifica] = useState(false);
  const navigate = useNavigate();
  const dopo = searchParams.get('dopo') || '/account';

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setCaricamento(true);
    try {
      const { token } = await clienteAuthApi.login(email, password);
      salvaTokenCliente(token);
      navigate(dopo);
    } catch (err) {
      setErrore(err instanceof ErroreClienteAuth ? err.message : 'Accesso non riuscito.');
    } finally {
      setCaricamento(false);
    }
  }

  async function rimandaVerifica() {
    setInviandoVerifica(true);
    try {
      await clienteAuthApi.rimandaVerifica(email);
      alert('Se l\'email risulta registrata e non ancora confermata, ti abbiamo appena mandato un nuovo link.');
    } finally {
      setInviandoVerifica(false);
    }
  }

  return (
    <div className="pagina-auth">
      <form onSubmit={accedi} className="box-auth">
        <h1>Accedi</h1>
        <p className="sottotitolo-auth">Entra nel tuo account INBUS per prenotare e vedere i tuoi viaggi.</p>

        <label>Email</label>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Password</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <p style={{ textAlign: 'right', margin: '-6px 0 4px' }}>
          <Link to="/password-dimenticata" style={{ fontSize: 12.5 }}>Password dimenticata?</Link>
        </p>

        {errore && (
          <div className="errore-auth">
            <p>{errore}</p>
            {errore.toLowerCase().includes('conferma') && (
              <button type="button" onClick={rimandaVerifica} disabled={inviandoVerifica} className="link-auth">
                {inviandoVerifica ? 'Invio...' : 'Rimanda email di conferma'}
              </button>
            )}
          </div>
        )}

        <button type="submit" className="search-cta" disabled={caricamento}>{caricamento ? 'Accesso...' : 'Accedi'}</button>

        <p className="sottotitolo-auth" style={{ marginTop: 18 }}>
          Non hai ancora un account? <Link to={`/registrati?dopo=${encodeURIComponent(dopo)}`}>Registrati</Link>
        </p>
      </form>
    </div>
  );
}
