import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CookieBanner } from './features/CookieBanner';
import { clienteLoggato } from './features/clienteSessione';
import { useCarrello } from './features/carrello/CarrelloContext';
import { LogoOnWay } from './features/LogoOnWay';
import { Footer } from './features/Footer';
import { Icona } from './features/Icone';
import { clienteAuthApi } from './api/clienteAuth';
import { inizializzaMetaPixel } from './features/metaPixel';
import { inizializzaGA4, tracciaPaginaGA4 } from './features/googleAnalytics';
import { plurale } from './shared/formato';

const VOCI_MENU = [
  { to: '/#eventi', ancora: 'eventi', testo: 'Eventi' },
  { to: '/bundle', ancora: null, testo: 'Bundle' },
  { to: '/#come-funziona', ancora: 'come-funziona', testo: 'Come funziona' },
];

/** Il guscio del sito pubblico: header (logo, menu, ricerca, carrello,
 *  account), menu mobile, piè di pagina e banner cookie. Le categorie
 *  degli eventi NON stanno qui: vivono solo nella sezione "Tutti gli
 *  eventi" della home. */
export function Layout({ children }: { children: ReactNode }) {
  useEffect(() => { inizializzaMetaPixel(); inizializzaGA4(); }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const inHomepage = location.pathname === '/';
  const { numeroArticoli } = useCarrello();

  // Solo il nome (o "Il mio account" finché non è ancora arrivato, o se
  // manca): cliccandolo si va sempre in /account, cambia solo l'etichetta.
  const loggato = clienteLoggato();
  const [nomeCliente, setNomeCliente] = useState<string | null>(null);
  useEffect(() => {
    if (!loggato) { setNomeCliente(null); return; }
    clienteAuthApi.me().then((c) => setNomeCliente(c.nome)).catch(() => {});
  }, [loggato]);
  const etichettaAccount = loggato ? (nomeCliente || 'Il mio account') : 'Accedi';
  const linkAccount = loggato ? '/account' : '/accedi';

  // Ogni cambio di pagina: gtag non lo fa da solo in una SPA (vedi
  // googleAnalytics.ts). Il Pixel traccia PageView una volta sola all'avvio.
  useEffect(() => { tracciaPaginaGA4(location.pathname + location.search, document.title); }, [location.pathname, location.search]);

  // ---------- Ricerca ----------
  // In home vive nell'URL (?q=…) e filtra mentre si scrive: la legge la
  // HomePage. Nelle altre pagine resta locale finché non si preme invio,
  // poi porta alla home con la ricerca già applicata.
  const [searchParams, setSearchParams] = useSearchParams();
  const [testoLocale, setTestoLocale] = useState('');
  const testoRicerca = inHomepage ? (searchParams.get('q') ?? '') : testoLocale;
  function scriviRicerca(valore: string) {
    if (!inHomepage) { setTestoLocale(valore); return; }
    const nuovi = new URLSearchParams(searchParams);
    if (valore) nuovi.set('q', valore); else nuovi.delete('q');
    setSearchParams(nuovi, { replace: true });
  }
  function inviaRicerca(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
    if (inHomepage) {
      document.getElementById('eventi')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const q = testoLocale.trim();
    setTestoLocale('');
    setRicercaMobileAperta(false);
    navigate(q ? `/?q=${encodeURIComponent(q)}#eventi` : '/#eventi');
  }

  const idRicerca = useId();
  const idRicercaMobile = useId();
  const [ricercaMobileAperta, setRicercaMobileAperta] = useState(false);
  const lenteRef = useRef<HTMLButtonElement>(null);
  const inputMobileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ricercaMobileAperta) inputMobileRef.current?.focus(); }, [ricercaMobileAperta]);
  function chiudiRicercaMobile(svuota: boolean) {
    if (svuota) scriviRicerca('');
    setRicercaMobileAperta(false);
    lenteRef.current?.focus();
  }

  // ---------- Menu mobile ----------
  const idMenu = useId();
  const [menuAperto, setMenuAperto] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMenuAperto(false); }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!menuAperto) return;
    const allaPressione = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuAperto(false);
      burgerRef.current?.focus();
    };
    // Se la finestra si allarga oltre i 900px il menu non si vede più:
    // lo chiudo, così non ricompare riaprendo la finestra stretta.
    const mq = window.matchMedia('(min-width: 901px)');
    const allaModifica = () => { if (mq.matches) setMenuAperto(false); };
    window.addEventListener('keydown', allaPressione);
    mq.addEventListener('change', allaModifica);
    return () => {
      window.removeEventListener('keydown', allaPressione);
      mq.removeEventListener('change', allaModifica);
    };
  }, [menuAperto]);

  /** Link a un'ancora della home ("/#eventi"): se sono già in home e
   *  l'ancora non cambia, React Router non scorre. Qui scorro io. */
  function vaiAllAncora(e: MouseEvent<HTMLAnchorElement>, ancora: string | null) {
    setMenuAperto(false);
    if (!ancora || !inHomepage) return;
    const destinazione = document.getElementById(ancora);
    if (!destinazione) return;
    e.preventDefault();
    navigate({ pathname: '/', search: location.search, hash: `#${ancora}` }, { replace: true });
    destinazione.scrollIntoView({ behavior: 'smooth' });
  }

  /** Etichetta, lente e campo: gli stessi nella barra desktop e nella riga mobile. */
  const campoRicerca = (id: string, ref?: React.Ref<HTMLInputElement>, onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void) => (
    <>
      <label className="sr-only" htmlFor={id}>Cerca un evento</label>
      <Icona nome="cerca" dimensione={18} className="header-ricerca-lente" />
      <input
        ref={ref}
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Cerca artista, evento o città"
        value={testoRicerca}
        onChange={(e) => scriviRicerca(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </>
  );

  return (
    <>
      <header className="header-sito">
        <div className="container header-riga">
          <LogoOnWay />

          <nav className="header-nav" aria-label="Principale">
            {VOCI_MENU.map((v) => <Link key={v.to} to={v.to} onClick={(e) => vaiAllAncora(e, v.ancora)}>{v.testo}</Link>)}
          </nav>

          <form className="header-ricerca" role="search" onSubmit={inviaRicerca}>
            {campoRicerca(idRicerca)}
          </form>

          <div className="header-azioni">
            <button
              ref={lenteRef}
              type="button"
              className="header-icona"
              aria-label="Cerca"
              aria-expanded={ricercaMobileAperta}
              aria-controls={idRicercaMobile}
              onClick={() => { setMenuAperto(false); setRicercaMobileAperta((v) => !v); }}
            >
              <Icona nome="cerca" dimensione={22} />
            </button>
            <Link className="carrello-icona" to="/carrello" aria-label={numeroArticoli > 0 ? `Carrello, ${plurale(numeroArticoli, 'posto', 'posti')}` : 'Carrello'}>
              <Icona nome="carrello" dimensione={22} />
              {numeroArticoli > 0 && <span className="carrello-badge" aria-hidden="true">{numeroArticoli}</span>}
            </Link>
            <Link className="btn btn-secondary btn-sm header-account" to={linkAccount}><span>{etichettaAccount}</span></Link>
            <button
              ref={burgerRef}
              type="button"
              className="burger"
              aria-label={menuAperto ? 'Chiudi il menu' : 'Apri il menu'}
              aria-expanded={menuAperto}
              aria-controls={idMenu}
              onClick={() => { setRicercaMobileAperta(false); setMenuAperto((v) => !v); }}
            >
              <Icona nome={menuAperto ? 'chiudi' : 'menu'} dimensione={24} />
            </button>
          </div>
        </div>

        {ricercaMobileAperta && (
          <div className="container header-ricerca-mobile" id={idRicercaMobile}>
            <form role="search" onSubmit={inviaRicerca}>
              <div className="header-ricerca">
                {campoRicerca(`${idRicercaMobile}-campo`, inputMobileRef, (e) => {
                  // Esc chiude la riga; preventDefault evita che il campo
                  // "search" si svuoti da solo.
                  if (e.key === 'Escape') { e.preventDefault(); chiudiRicercaMobile(false); }
                })}
              </div>
              <button type="button" className="btn btn-tertiary" onClick={() => chiudiRicercaMobile(true)}>Annulla</button>
            </form>
          </div>
        )}
      </header>

      <nav className="mobile-nav" id={idMenu} aria-label="Menu" hidden={!menuAperto}>
        {VOCI_MENU.map((v) => <Link key={v.to} to={v.to} onClick={(e) => vaiAllAncora(e, v.ancora)}>{v.testo}</Link>)}
        <Link to="/faq" onClick={() => setMenuAperto(false)}>FAQ</Link>
        <Link className="btn btn-primary btn-lg btn-block" to={linkAccount} onClick={() => setMenuAperto(false)}>{etichettaAccount}</Link>
      </nav>

      {children}

      <Footer />
      <CookieBanner />
    </>
  );
}
