import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clienteAuthApi, ErroreClienteAuth } from '../api/clienteAuth';
import '../styles/account.css';

export function RegistratiPage() {
  const [searchParams] = useSearchParams();
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [citta, setCitta] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [password, setPassword] = useState('');
  const [confermaPassword, setConfermaPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [inviata, setInviata] = useState(false);
  const dopo = searchParams.get('dopo') || '/account';

  async function registrati(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    if (password !== confermaPassword) { setErrore('Le due password non coincidono.'); return; }
    if (password.length < 8) { setErrore('La password deve avere almeno 8 caratteri.'); return; }
    if (!dataNascita) { setErrore('Inserisci la tua data di nascita.'); return; }

    setCaricamento(true);
    try {
      await clienteAuthApi.registrati({ nome, cognome, email, telefono: telefono || undefined, citta: citta || undefined, password, dataNascita });
      setInviata(true);
    } catch (err) {
      setErrore(err instanceof ErroreClienteAuth ? err.message : 'Registrazione non riuscita.');
    } finally {
      setCaricamento(false);
    }
  }

  if (inviata) {
    return (
      <div className="pagina-auth">
        <div className="box-auth">
          <h1>Controlla la tua email</h1>
          <p className="sottotitolo-auth">
            Ti abbiamo mandato un link a <b>{email}</b> — cliccalo per confermare il tuo indirizzo e attivare
            l'account. Se non lo vedi, controlla anche nello spam.
          </p>
          <Link to={`/accedi?dopo=${encodeURIComponent(dopo)}`} className="search-cta" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
            Vai alla pagina di accesso
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-auth">
      <form onSubmit={registrati} className="box-auth">
        <h1>Crea il tuo account</h1>
        <p className="sottotitolo-auth">Serve per prenotare, vedere i tuoi viaggi e il tuo credito fedeltà.</p>

        <div className="due-colonne-auth">
          <div>
            <label>Nome</label>
            <input autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div>
            <label>Cognome</label>
            <input autoComplete="family-name" value={cognome} onChange={(e) => setCognome(e.target.value)} required />
          </div>
        </div>

        <label>Email</label>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Telefono (facoltativo)</label>
        <input type="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />

        <label>Città (facoltativo)</label>
        <input type="text" autoComplete="address-level2" value={citta} onChange={(e) => setCitta(e.target.value)} />

        <label>Data di nascita</label>
        <input type="date" autoComplete="bday" value={dataNascita} onChange={(e) => setDataNascita(e.target.value)} required />
        <p className="sottotitolo-auth" style={{ fontSize: 12.5, marginTop: -6 }}>Serve per organizzare al meglio i gruppi sui bus quando prenoti in più persone.</p>

        <label>Password (almeno 8 caratteri)</label>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <label>Conferma password</label>
        <input type="password" autoComplete="new-password" value={confermaPassword} onChange={(e) => setConfermaPassword(e.target.value)} required />

        {errore && <div className="errore-auth"><p>{errore}</p></div>}

        <button type="submit" className="search-cta" disabled={caricamento}>{caricamento ? 'Invio...' : 'Registrati'}</button>

        <p className="sottotitolo-auth" style={{ marginTop: 18 }}>
          Hai già un account? <Link to={`/accedi?dopo=${encodeURIComponent(dopo)}`}>Accedi</Link>
        </p>
      </form>
    </div>
  );
}
