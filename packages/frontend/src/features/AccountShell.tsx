import { useEffect, useRef, type ReactNode } from 'react';
import { LogoOnWay } from './LogoOnWay';
import { Link } from 'react-router-dom';

export interface VoceMenuAccount {
  id: string;
  label: string;
}

/** Guscio unico dei quattro account (cliente, promoter, organizzatore,
 *  tour leader): barra in alto, menu delle sezioni e contenuto.
 *
 *  Su desktop il menu è una colonna a sinistra. Su telefono NON è più
 *  un pannello a schermo intero dietro un ☰: le sezioni stanno in una
 *  riga di chip che scorre in orizzontale, sempre visibile sotto la
 *  barra — si vede dove si è senza aprire niente, e si cambia sezione
 *  con un tocco solo invece di tre.
 *
 *  Un solo componente invece di quattro copie quasi identiche: un
 *  cambio di struttura vale per tutti. */
export function AccountShell({
  etichettaTipo, voci, voceAttiva, onCambiaVoce, nomeUtente, onLogout, children,
  contenutoLarghezzaPiena, temaChiaro, esciInSezione,
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
  /** Promoter/organizzatore/tour leader usano un tema chiaro dedicato
   *  (promoter.css, classe "pagina-partner") — SOLO loro: quella
   *  classe ridefinisce --paper in un colore scuro (pensato per testo
   *  su sfondo chiaro), e applicata anche all'account cliente (che
   *  invece eredita i colori scuri del sito) rendeva il testo scuro
   *  su sfondo scuro, illeggibile. Di default false: il cliente non
   *  la passa e riceve invece "account-cliente", la classe sotto cui
   *  sono scopati account.css e sito/account-cliente.css (tema
   *  scuro). Le due classi non convivono mai sullo stesso guscio. */
  temaChiaro?: boolean;
  /** Chi ha una sezione "Profilo" ci mette dentro il pulsante "Esci"
   *  (account cliente): su telefono, dove non c'è la colonna del menu,
   *  il guscio allora non lo mostra due volte. Senza questo prop il
   *  pulsante resta comunque raggiungibile sotto le chip. */
  esciInSezione?: boolean;
}) {
  // Se la sezione attiva arriva dall'indirizzo (?sezione=privacy) la
  // sua chip può stare fuori dallo schermo: la riportiamo in vista
  // senza muovere la pagina in verticale.
  const barraRef = useRef<HTMLElement>(null);
  useEffect(() => {
    barraRef.current?.querySelector('.account-tab-chip.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [voceAttiva]);

  return (
    <div className={`account-shell${temaChiaro ? ' pagina-partner' : ' account-cliente'}${esciInSezione ? ' esci-in-sezione' : ''}`}>
      {/* Barra in alto, a tutta larghezza: il logo del sito a sinistra
          (cliccabile, torna a navigare) e il nome di chi è collegato a
          destra. Sotto, il menu — sidebar su desktop, chip su telefono. */}
      <div className="account-topbar">
        <Link to="/" className="account-topbar-logo" aria-label="Torna al sito"><LogoOnWay come="testo" /></Link>
        <span className="account-topbar-nome">{nomeUtente ?? etichettaTipo}</span>
      </div>

      <nav className="account-tab-bar" aria-label="Sezioni" ref={barraRef}>
        {voci.map((v) => (
          <button
            key={v.id} type="button"
            className={`account-tab-chip${voceAttiva === v.id ? ' active' : ''}`}
            aria-current={voceAttiva === v.id ? 'page' : undefined}
            onClick={() => onCambiaVoce(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="account-corpo">
        <aside className="account-sidebar">
          <nav className="account-nav" aria-label="Sezioni">
            {voci.map((v) => (
              <button
                key={v.id} type="button"
                className={`account-nav-voce${voceAttiva === v.id ? ' active' : ''}`}
                aria-current={voceAttiva === v.id ? 'page' : undefined}
                onClick={() => onCambiaVoce(v.id)}
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
