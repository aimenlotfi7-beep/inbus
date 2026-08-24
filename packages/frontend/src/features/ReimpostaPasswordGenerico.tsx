import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { erroreValidazionePassword } from './validazionePassword';

export function ReimpostaPasswordGenerico({ onConferma, linkDopoSuccesso, etichettaDopoSuccesso, linkIndietro }: {
  onConferma: (token: string, password: string) => Promise<unknown>;
  linkDopoSuccesso: string;
  etichettaDopoSuccesso: string;
  linkIndietro: string;
}) {
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
      await onConferma(token, password);
      setFatto(true);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Link scaduto o non valido — richiedine uno nuovo.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="pagina-auth">
      <div className="box-auth">
        <h1>Reimposta password</h1>
        {fatto ? (
          <>
            <p className="sottotitolo-auth">✓ Fatto — la tua password è stata cambiata.</p>
            <button type="button" className="search-cta" onClick={() => navigate(linkDopoSuccesso)}>{etichettaDopoSuccesso}</button>
          </>
        ) : (
          <form onSubmit={invia}>
            <p className="sottotitolo-auth">Scegli una nuova password per il tuo account.</p>
            <label>Nuova password</label>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <label>Ripeti la password</label>
            <input type="password" autoComplete="new-password" value={conferma} onChange={(e) => setConferma(e.target.value)} required />
            {errore && <p className="errore-auth">{errore}</p>}
            <button type="submit" className="search-cta" disabled={caricamento}>{caricamento ? 'Salvataggio...' : 'Salva nuova password'}</button>
            <p className="sottotitolo-auth" style={{ marginTop: 18 }}>
              <Link to={linkIndietro}>← Torna al login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
