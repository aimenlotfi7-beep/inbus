import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clienteAuthApi, ErroreClienteAuth } from '../api/clienteAuth';
import { salvaTokenCliente } from '../features/clienteSessione';
import { AuthShell } from '../features/AuthShell';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { CampoPassword } from '../features/CampoPassword';
import { useSeoTags } from '../features/useSeoTags';
import '../styles/account.css';

export function AccediPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [inviandoVerifica, setInviandoVerifica] = useState(false);
  // Esito del "rimanda email di conferma": prima era un alert() del
  // browser, ora un messaggio che resta sulla pagina.
  const [esitoVerifica, setEsitoVerifica] = useState('');
  const navigate = useNavigate();
  // Login "normale" (non da un checkout/altro flusso che chiede di
  // accedere per continuare) riporta alla home, non dentro l'account —
  // chi ha appena cliccato "Accedi" dall'intestazione vuole tornare a
  // navigare il sito come chiunque altro, non finire dritto nella
  // sezione account (ci arriva cliccando il proprio nome, quando vuole).
  const dopo = searchParams.get('dopo') || '/';
  const sessioneScaduta = searchParams.get('motivo') === 'scaduta';

  useSeoTags({
    title: 'Accedi — OnWay',
    description: 'Entra nel tuo account OnWay per vedere i tuoi viaggi e prenotare più in fretta.',
    url: `${window.location.origin}/accedi`,
  });

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setEsitoVerifica('');
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
    setEsitoVerifica('');
    try {
      await clienteAuthApi.rimandaVerifica(email);
      setEsitoVerifica("Se l'indirizzo risulta registrato e non ancora confermato, ti abbiamo appena mandato un nuovo link.");
    } finally {
      setInviandoVerifica(false);
    }
  }

  return (
    <AuthShell>
      <h1>Accedi</h1>
      <p className="auth-sottotitolo">Per vedere i tuoi viaggi e prenotare più in fretta.</p>

      {sessioneScaduta && <p className="avviso avviso-attenzione auth-avviso">La sessione è scaduta, accedi di nuovo.</p>}

      <form onSubmit={accedi}>
        <CampoTesto
          id="accedi-email" etichetta="Email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <CampoPassword
          id="accedi-password" etichetta="Password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          azione={<Link className="campo-etichetta-link" to="/password-dimenticata">Password dimenticata?</Link>}
        />

        {errore && (
          <div className="avviso avviso-errore auth-avviso" role="alert">
            <p>{errore}</p>
            {errore.toLowerCase().includes('conferma') && (
              <button type="button" className="btn btn-tertiary" onClick={rimandaVerifica} disabled={inviandoVerifica}>
                {inviandoVerifica ? 'Invio in corso…' : 'Rimanda email di conferma'}
              </button>
            )}
          </div>
        )}
        {esitoVerifica && <p className="avviso avviso-ok auth-avviso" role="status">{esitoVerifica}</p>}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
          {caricamento ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>

      <p className="auth-link-riga">
        Non hai un account? <Link to={`/registrati?dopo=${encodeURIComponent(dopo)}`}>Registrati</Link>
      </p>
    </AuthShell>
  );
}
