import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clienteAuthApi, ErroreClienteAuth } from '../api/clienteAuth';
import { AuthShell } from '../features/AuthShell';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { CampoPassword } from '../features/CampoPassword';
import { useSeoTags } from '../features/useSeoTags';
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
  const dopo = searchParams.get('dopo') || '/'; // stessa scelta di AccediPage.tsx — dopo la registrazione, torna al sito normale

  useSeoTags({
    title: 'Crea il tuo account — OnWay',
    description: 'Crea il tuo account OnWay: prenoti più in fretta, ritrovi i tuoi viaggi e il tuo credito.',
    url: `${window.location.origin}/registrati`,
  });

  async function registrati(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    if (password !== confermaPassword) { setErrore('Le due password non coincidono.'); return; }
    if (password.length < 8) { setErrore('La password deve avere almeno 8 caratteri.'); return; }
    if (!dataNascita) { setErrore('Inserisci la tua data di nascita.'); return; }

    setCaricamento(true);
    try {
      await clienteAuthApi.registrati({ nome, cognome, email, telefono: telefono || undefined, citta: citta || undefined, password, dataNascita, codiceReferral: searchParams.get('ref') || undefined });
      setInviata(true);
    } catch (err) {
      setErrore(err instanceof ErroreClienteAuth ? err.message : 'Registrazione non riuscita.');
    } finally {
      setCaricamento(false);
    }
  }

  if (inviata) {
    return (
      <AuthShell>
        <h1>Controlla la tua email</h1>
        <p className="auth-sottotitolo">
          Ti abbiamo mandato un link a <b>{email}</b>: cliccalo per confermare il tuo indirizzo e attivare
          l'account. Se non lo vedi, guarda anche nello spam.
        </p>
        <Link to={`/accedi?dopo=${encodeURIComponent(dopo)}`} className="btn btn-primary btn-lg btn-block">
          Vai all'accesso
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>Crea il tuo account</h1>
      <p className="auth-sottotitolo">Serve per prenotare, ritrovare i tuoi viaggi e il tuo credito.</p>

      {searchParams.get('ref') && (
        <p className="avviso avviso-ok auth-avviso">
          Sei stato invitato da un amico: completa la registrazione e ti aspetta un bonus di benvenuto sul credito.
        </p>
      )}

      <form onSubmit={registrati}>
        <div className="auth-due-colonne">
          <CampoTesto
            id="reg-nome" etichetta="Nome" autoComplete="given-name" required
            value={nome} onChange={(e) => setNome(e.target.value)}
          />
          <CampoTesto
            id="reg-cognome" etichetta="Cognome" autoComplete="family-name" required
            value={cognome} onChange={(e) => setCognome(e.target.value)}
          />
        </div>

        <CampoTesto
          id="reg-email" etichetta="Email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <CampoTesto
          id="reg-telefono" etichetta="Telefono (facoltativo)" type="tel" autoComplete="tel"
          value={telefono} onChange={(e) => setTelefono(e.target.value)}
        />
        <CampoTesto
          id="reg-nascita" etichetta="Data di nascita" type="date" autoComplete="bday" required
          aiuto="Serve per organizzare i gruppi sul bus"
          value={dataNascita} onChange={(e) => setDataNascita(e.target.value)}
        />
        <CampoTesto
          id="reg-citta" etichetta="Città (facoltativa)" autoComplete="address-level2"
          value={citta} onChange={(e) => setCitta(e.target.value)}
        />
        <CampoPassword
          id="reg-password" etichetta="Password" autoComplete="new-password" required
          aiuto="Almeno 8 caratteri"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <CampoPassword
          id="reg-conferma" etichetta="Conferma password" autoComplete="new-password" required
          value={confermaPassword} onChange={(e) => setConfermaPassword(e.target.value)}
        />

        {errore && <p className="avviso avviso-errore auth-avviso" role="alert">{errore}</p>}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
          {caricamento ? 'Creazione in corso…' : "Crea l'account"}
        </button>
      </form>

      <p className="auth-link-riga">
        Hai già un account? <Link to={`/accedi?dopo=${encodeURIComponent(dopo)}`}>Accedi</Link>
      </p>
    </AuthShell>
  );
}
