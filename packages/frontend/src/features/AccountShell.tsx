import { useState, type ReactNode } from 'react';
import { LogoOnWay } from './LogoOnWay';
import { Link } from 'react-router-dom';

export interface VoceMenuAccount {
  id: string;
  label: string;
}

/** Menu laterale unico per i tre account self-service (promoter,
 *  organizzatore, tour leader) — stesso meccanismo del gestionale:
 *  sidebar fissa su desktop, su mobile un pulsante ☰ apre un pannello
 *  a schermo intero con l'elenco verticale (niente fila orizzontale
 *  di tab che su schermi stretti si accorcia o va a capo in modo
 *  imprevedibile). Un solo componente invece di tre copie quasi
 *  identiche — un cambio di stile/comportamento vale per tutti. */
export function AccountShell({
  etichettaTipo, voci, voceAttiva, onCambiaVoce, nomeUtente, onLogout, children, contenutoLarghezzaPiena,
}: {
  etichettaTipo: string;
  voci: VoceMenuAccount[];
  voceAttiva: string;
  onCambiaVoce: (id: string) => void;
  nomeUtente?: string | null;
  onLogout: () => void;
  children: ReactNode;
  /** Per una voce che incorpora un'intera pagina a sé (es. "Scopri
   *  eventi" nell'account cliente, che mostra la home del sito per
   *  intero) — niente padding/contenitore attorno, quella pagina
   *  gestisce già da sola il proprio spazio. */
  contenutoLarghezzaPiena?: boolean;
}) {
  const [menuMobileAperto, setMenuMobileAperto] = useState(false);

  function scegli(id: string) {
    onCambiaVoce(id);
    setMenuMobileAperto(false); // su mobile, scegliere una voce chiude subito il pannello
  }

  return (
    <div className="pagina-partner account-shell">
      {/* Barra in alto, a tutta larghezza — il nome sempre a sinistra,
          il logo del sito (cliccabile, torna a navigare) sempre a
          destra. Separata dalla sidebar sotto: quella resta solo per
          le voci del menu. */}
      <div className="account-topbar">
        <Link to="/" className="account-topbar-logo" aria-label="Torna al sito"><LogoOnWay come="testo" /></Link>
        <span className="account-topbar-nome">{nomeUtente ?? etichettaTipo}</span>
      </div>

      <div className="account-corpo">
        <aside className="account-sidebar">
          <button type="button" className="account-hamburger" aria-label="Apri il menu" onClick={() => setMenuMobileAperto(true)}>☰ Menu</button>

          <nav className={`account-nav${menuMobileAperto ? ' aperto' : ''}`}>
            <div className="account-nav-intestazione-mobile">
              <span>Menu</span>
              <button type="button" aria-label="Chiudi il menu" onClick={() => setMenuMobileAperto(false)}>✕</button>
            </div>
            {voci.map((v) => (
              <button
                key={v.id} type="button"
                className={`account-nav-voce${voceAttiva === v.id ? ' active' : ''}`}
                onClick={() => scegli(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>

          <div className="account-piede">
            <button type="button" className="btn btn-ghost" onClick={onLogout}>Esci</button>
          </div>
        </aside>

        <main className="account-main" style={contenutoLarghezzaPiena ? { padding: 0, maxWidth: 'none' } : undefined}>{children}</main>
      </div>
    </div>
  );
}
