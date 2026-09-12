import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from './AuthShell';
import { CampoTesto } from './checkout/CampoTesto';
import { Icona } from './Icone';

/** Schermata "password dimenticata" generica — usata da tutti i tipi
 *  di account (cliente, promoter, organizzatore, tour leader): ognuno
 *  passa la propria funzione di richiesta, il link per tornare indietro
 *  e, se è un portale di lavoro, il tema chiaro. */
export function RichiediResetGenerico({ onRichiedi, linkIndietro, titoloExtra, temaChiaro, etichettaTipo }: {
  onRichiedi: (email: string) => Promise<unknown>;
  linkIndietro: string;
  titoloExtra?: string;
  temaChiaro?: boolean;
  etichettaTipo?: string;
}) {
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setCaricamento(true);
    try {
      await onRichiedi(email);
      setInviato(true);
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <AuthShell temaChiaro={temaChiaro} etichettaTipo={etichettaTipo}>
      <h1>Password dimenticata?</h1>
      <p className="auth-sottotitolo">
        {titoloExtra ? `${titoloExtra} — ` : ''}Scrivi la tua email: se corrisponde a un account, ti mandiamo un link
        per sceglierne una nuova.
      </p>

      {inviato ? (
        <p className="auth-esito" role="status">
          <Icona nome="spunta" dimensione={20} strokeWidth={2.4} />
          Controlla la posta (anche lo spam): il link resta valido per un paio d'ore.
        </p>
      ) : (
        <form onSubmit={invia}>
          <CampoTesto
            id="reset-email" etichetta="Email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
            {caricamento ? 'Invio in corso…' : 'Invia il link'}
          </button>
        </form>
      )}

      <p className="auth-link-riga">
        <Link to={linkIndietro}>Torna all'accesso</Link>
      </p>
    </AuthShell>
  );
}
