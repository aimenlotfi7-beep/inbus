import { useState } from 'react';
import { Link } from 'react-router-dom';

/** Schermata "password dimenticata" generica — usata da tutti i tipi
 *  di account (cliente, admin, promoter, tour leader), ognuno passa
 *  solo la propria funzione di richiesta e il link per tornare indietro. */
export function RichiediResetGenerico({ onRichiedi, linkIndietro, titoloExtra }: {
  onRichiedi: (email: string) => Promise<unknown>;
  linkIndietro: string;
  titoloExtra?: string;
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
    <div className="pagina-auth">
      <form onSubmit={invia} className="box-auth">
        <h1>Password dimenticata?</h1>
        <p className="sottotitolo-auth">
          {titoloExtra ? `${titoloExtra} — ` : ''}Scrivi la tua email: se corrisponde a un account, ti mandiamo un link per sceglierne una nuova.
        </p>

        {inviato ? (
          <p style={{ fontSize: 14 }}>✓ Controlla la posta (anche lo spam) — il link resta valido per un paio d'ore.</p>
        ) : (
          <>
            <label>Email</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button type="submit" className="search-cta" disabled={caricamento}>{caricamento ? 'Invio...' : 'Invia link'}</button>
          </>
        )}

        <p className="sottotitolo-auth" style={{ marginTop: 18 }}>
          <Link to={linkIndietro}>← Torna al login</Link>
        </p>
      </form>
    </div>
  );
}
