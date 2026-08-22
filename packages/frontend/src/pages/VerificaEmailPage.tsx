import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { clienteAuthApi, ErroreClienteAuth } from '../api/clienteAuth';
import { salvaTokenCliente } from '../features/clienteSessione';
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
    <div className="pagina-auth">
      <div className="box-auth" style={{ textAlign: 'center' }}>
        {stato === 'verificando' && <p className="sottotitolo-auth">Verifica in corso...</p>}
        {stato === 'ok' && (
          <>
            <h1>Email confermata ✓</h1>
            <p className="sottotitolo-auth">Ti stiamo portando alla tua area personale...</p>
          </>
        )}
        {stato === 'errore' && (
          <>
            <h1>Verifica non riuscita</h1>
            <p className="sottotitolo-auth">{messaggioErrore}</p>
            <Link to="/registrati" className="search-cta" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
              Registrati di nuovo
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
