import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { clienteAuthApi, ErroreClienteAuth } from '../api/clienteAuth';
import { salvaTokenCliente } from '../features/clienteSessione';
import { AuthShell } from '../features/AuthShell';
import { Icona } from '../features/Icone';
import '../styles/account.css';

export function VerificaEmailPage() {
  const { token } = useParams<{ token: string }>();
  const [stato, setStato] = useState<'verificando' | 'ok' | 'errore'>('verificando');
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) { setStato('errore'); setMessaggioErrore('Link non valido.'); return; }
    clienteAuthApi.verificaEmail(token)
      .then(({ token: sessione }) => {
        salvaTokenCliente(sessione);
        setStato('ok');
        setTimeout(() => navigate('/account'), 1800);
      })
      .catch((e) => {
        setStato('errore');
        setMessaggioErrore(e instanceof ErroreClienteAuth ? e.message : 'Verifica non riuscita.');
      });
  }, [token, navigate]);

  return (
    <AuthShell>
      {stato === 'verificando' && <p className="auth-sottotitolo" role="status">Verifica in corso…</p>}

      {stato === 'ok' && (
        <>
          <h1>Email confermata</h1>
          <p className="auth-esito" role="status">
            <Icona nome="spunta" dimensione={20} strokeWidth={2.4} />
            Ti stiamo portando nella tua area personale…
          </p>
        </>
      )}

      {stato === 'errore' && (
        <>
          <h1>Verifica non riuscita</h1>
          <p className="avviso avviso-errore auth-avviso" role="alert">{messaggioErrore}</p>
          <Link to="/registrati" className="btn btn-primary btn-lg btn-block">Registrati di nuovo</Link>
        </>
      )}
    </AuthShell>
  );
}
