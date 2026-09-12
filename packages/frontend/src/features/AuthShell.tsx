import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoOnWay } from './LogoOnWay';

/** Il guscio di TUTTE le pagine di accesso: accedi, registrati,
 *  password dimenticata, reimposta password, verifica email e le stesse
 *  pagine dei partner (promoter, organizzatore, tour leader).
 *
 *  Tre fasce: intestazione con il logo a sinistra e "Torna al sito" a
 *  destra, il corpo con l'unico riquadro (max 440px) e un piede con
 *  l'aiuto. Su telefono il riquadro parte dall'alto — centrarlo
 *  verticalmente lo faceva "galleggiare" in mezzo al vuoto con la
 *  tastiera aperta.
 *
 *  I tag sono <div>, non <header>/<footer>: header.css stila quei tag
 *  nudi (barra e piè di pagina del sito pubblico) e li trascinerebbe
 *  qui dentro.
 *
 *  temaChiaro aggiunge "pagina-partner": la stessa struttura sulla
 *  palette chiara dei portali di lavoro (vedi promoter.css), senza
 *  mischiare i due temi sullo stesso elemento. */
export function AuthShell({
  children, temaChiaro, etichettaTipo, linkRitorno = '/', etichettaRitorno = 'Torna al sito',
}: {
  children: ReactNode;
  /** Solo promoter, organizzatore e tour leader (tema chiaro). */
  temaChiaro?: boolean;
  /** Parolina sotto il logo: "promoter", "organizzatore", "tour leader". */
  etichettaTipo?: string;
  linkRitorno?: string;
  etichettaRitorno?: string;
}) {
  return (
    <div className={`pagina-auth${temaChiaro ? ' pagina-partner' : ''}`}>
      <div className="auth-testata">
        <Link to="/" className="auth-logo" aria-label="OnWay, vai alla home">
          <LogoOnWay come="testo" chiaro={temaChiaro} />
          {etichettaTipo && <small>{etichettaTipo}</small>}
        </Link>
        <Link to={linkRitorno} className="btn btn-tertiary">{etichettaRitorno}</Link>
      </div>

      <main className="auth-corpo">
        <div className="box-auth">{children}</div>
      </main>

      <div className="auth-piede">
        <p>Serve aiuto? <Link to="/pagina/contatti">Contattaci</Link></p>
      </div>
    </div>
  );
}
