import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { erroreValidazionePassword } from './validazionePassword';
import { AuthShell } from './AuthShell';
import { CampoPassword } from './CampoPassword';
import { Icona } from './Icone';
import { useSeoTags } from './useSeoTags';
import { testoErrore } from '../shared/errori';

/** "Scegli una nuova password" per tutti i tipi di account: il token
 *  arriva dal link nell'email, la regola sulla password è una sola
 *  (validazionePassword.ts). */
export function ReimpostaPasswordGenerico({ onConferma, linkDopoSuccesso, etichettaDopoSuccesso, linkIndietro, temaChiaro, etichettaTipo }: {
  onConferma: (token: string, password: string) => Promise<unknown>;
  linkDopoSuccesso: string;
  etichettaDopoSuccesso: string;
  linkIndietro: string;
  temaChiaro?: boolean;
  etichettaTipo?: string;
}) {
  // Il percorso contiene il token del link: fuori da og:url e canonical.
  useSeoTags({
    title: 'Reimposta la password — OnWay',
    description: 'Scegli una nuova password per il tuo account OnWay.',
    url: `${window.location.origin}${linkIndietro}`,
  });
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
      setErrore(testoErrore(e));
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <AuthShell temaChiaro={temaChiaro} etichettaTipo={etichettaTipo}>
      <h1>Reimposta la password</h1>

      {fatto ? (
        <>
          <p className="auth-esito" role="status">
            <Icona nome="spunta" dimensione={20} strokeWidth={2.4} />
            Fatto: la tua password è stata cambiata.
          </p>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => navigate(linkDopoSuccesso)}>
            {etichettaDopoSuccesso}
          </button>
        </>
      ) : (
        <form onSubmit={invia}>
          <p className="auth-sottotitolo">Scegli una nuova password per il tuo account.</p>
          <CampoPassword
            id="nuova-password" etichetta="Nuova password" autoComplete="new-password" required
            aiuto="Almeno 8 caratteri"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <CampoPassword
            id="ripeti-password" etichetta="Ripeti la password" autoComplete="new-password" required
            value={conferma} onChange={(e) => setConferma(e.target.value)}
          />
          {errore && <p className="avviso avviso-errore auth-avviso" role="alert">{errore}</p>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
            {caricamento ? 'Salvataggio in corso…' : 'Salva la nuova password'}
          </button>
        </form>
      )}

      <p className="auth-link-riga">
        <Link to={linkIndietro}>Torna all'accesso</Link>
      </p>
    </AuthShell>
  );
}
