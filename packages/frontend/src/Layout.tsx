import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CookieBanner, LinkPreferenzeCookie } from './features/CookieBanner';
import { clienteLoggato } from './features/clienteSessione';
import { useCarrello } from './features/carrello/CarrelloContext';
import { categorieEventoApi, type CategoriaEvento } from './api/categorieEvento';

export function Layout({ children }: { children: ReactNode }) {
  const [menuMobileAperto, setMenuMobileAperto] = useState(false);
  const loggato = clienteLoggato();
  const { numeroArticoli } = useCarrello();
  const location = useLocation();
  const inHomepage = location.pathname === '/';
  // La ricerca vive nell'URL (?q=...), non in uno stato locale — così
  // header (qui) e homepage possono leggerla e scriverla entrambe,
  // senza doverla far viaggiare come prop tra due componenti che
  // altrimenti non si parlerebbero (Layout avvolge OGNI pagina,
  // HomePage è solo una di quelle).
  const [searchParams, setSearchParams] = useSearchParams();
  const testoRicerca = searchParams.get('q') ?? '';
  // Le categorie non sono più fisse — arrivano dal gestionale, dove se
  // ne possono aggiungere quante se ne vogliono. Il pulsante "Tutti" è
  // sempre il primo, aggiunto qui, non fa parte dell'elenco vero.
  const [categorie, setCategorie] = useState<CategoriaEvento[]>([]);
  useEffect(() => { categorieEventoApi.list().then(setCategorie); }, []);
  const categoriaAttiva = searchParams.get('categoria');
  function impostaCategoria(nome: string) {
    const nuovi = new URLSearchParams(searchParams);
    if (nome === 'Tutti') {
      // "Tutti" deve azzerare DAVVERO ogni filtro — se restasse attivo
      // anche il filtro genere separato (più in basso nella pagina),
      // il risultato sembrerebbe ancora filtrato nonostante "Tutti"
      // fosse selezionato.
      nuovi.delete('categoria');
      nuovi.delete('genere');
    } else {
      nuovi.set('categoria', nome);
      nuovi.delete('genere');
    }
    setSearchParams(nuovi, { replace: true });
    document.getElementById('eventi')?.scrollIntoView({ behavior: 'smooth' });
  }

  // Su mobile la fascia delle categorie si nasconde scorrendo verso il
  // basso (per non rubare spazio mentre si legge), e ricompare
  // scorrendo verso l'alto — comportamento richiesto solo lì: su
  // desktop resta sempre ferma, non serve nasconderla.
  const [categorieNascoste, setCategorieNascoste] = useState(false);
  const ultimoScrollY = useRef(0);
  useEffect(() => {
    function alloScroll() {
      const y = window.scrollY;
      setCategorieNascoste(y > ultimoScrollY.current && y > 80);
      ultimoScrollY.current = y;
    }
    window.addEventListener('scroll', alloScroll, { passive: true });
    return () => window.removeEventListener('scroll', alloScroll);
  }, []);

  return (
    <>
      <header>
        <div className="header-sinistra">
          <Link to="/" className="logo">IN<span>BUS</span></Link>
          <nav className="links">
            <Link to="/#consigliati">Eventi Consigliati</Link>
            <Link to="/#eventi">Eventi</Link>
          </nav>
        </div>

        {inHomepage && (
          <div className="header-centro">
            <form
              className="header-ricerca"
              onSubmit={(e) => { e.preventDefault(); document.getElementById('eventi')?.scrollIntoView({ behavior: 'smooth' }); }}
            >
              <button type="submit" aria-label="Cerca">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              </button>
              <input
                type="text"
                placeholder="Cerca artista, evento o città..."
                value={testoRicerca}
                onChange={(e) => {
                  const nuovi = new URLSearchParams(searchParams);
                  if (e.target.value) nuovi.set('q', e.target.value); else nuovi.delete('q');
                  setSearchParams(nuovi, { replace: true });
                }}
              />
            </form>
            {/* Categorie desktop — dentro l'header stesso, accanto alla
                ricerca. Su mobile questa copia resta nascosta (vedi
                CSS): lì le categorie stanno in una fascia propria
                subito sotto, mai dentro questa riga col carrello. */}
            <div className="header-categorie-desktop">
              <button type="button" className={`categoria-chip${!categoriaAttiva ? ' active' : ''}`} onClick={() => impostaCategoria('Tutti')}>Tutti</button>
              {categorie.map((c) => (
                <button key={c.id} type="button" className={`categoria-chip${categoriaAttiva === c.nome ? ' active' : ''}`} onClick={() => impostaCategoria(c.nome)}>
                  {c.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="nav-actions">
          <Link className="carrello-icona" to="/carrello" aria-label="Carrello">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {numeroArticoli > 0 && <span className="carrello-badge">{numeroArticoli}</span>}
          </Link>
          <Link className="btn btn-ghost desktop-only" to={loggato ? '/account' : '/accedi'}>{loggato ? 'Il mio account' : 'Accedi'}</Link>
          <button className="burger" onClick={() => setMenuMobileAperto(!menuMobileAperto)}>☰</button>
        </div>
      </header>

      {/* Categorie mobile — fascia propria, FUORI dall'header (mai
          insieme al carrello/ricerca), sfondo trasparente, sparisce
          scorrendo verso il basso. Su desktop questa copia resta
          nascosta (vedi CSS): lì le categorie sono già nell'header
          sopra. */}
      {inHomepage && (
        <div className={`header-categorie-mobile${categorieNascoste ? ' nascosta' : ''}`}>
          <button type="button" className={`categoria-chip${!categoriaAttiva ? ' active' : ''}`} onClick={() => impostaCategoria('Tutti')}>Tutti</button>
          {categorie.map((c) => (
            <button key={c.id} type="button" className={`categoria-chip${categoriaAttiva === c.nome ? ' active' : ''}`} onClick={() => impostaCategoria(c.nome)}>
              {c.nome}
            </button>
          ))}
        </div>
      )}

      <div className={`mobile-nav${menuMobileAperto ? ' open' : ''}`}>
        <Link to="/#consigliati" onClick={() => setMenuMobileAperto(false)}>Eventi Consigliati</Link>
        <Link to="/#eventi" onClick={() => setMenuMobileAperto(false)}>Eventi</Link>
        <Link className="btn btn-primary" to={loggato ? '/account' : '/accedi'} style={{ textAlign: 'center', marginTop: 10 }} onClick={() => setMenuMobileAperto(false)}>{loggato ? 'Il mio account' : 'Accedi'}</Link>
      </div>

      {children}

      <footer id="assistenza">
        <div className="footer-grid">
          <div>
            <div className="logo">IN<span>BUS</span></div>
            <p style={{ color: 'var(--mist)', fontSize: 13.5, maxWidth: '32ch', marginTop: 14 }}>Il modo più comodo e sicuro per arrivare ai tuoi concerti preferiti, in tutta Italia.</p>
          </div>
          <div>
            <h5>Naviga</h5>
            <ul>
              <li><Link to="/#eventi">Eventi</Link></li>
              <li><Link to="/#come-funziona">Come funziona</Link></li>
              <li><Link to="/pagina/chisiamo">Chi siamo</Link></li>
              <li><Link to="/tour-leader">Lavora con noi</Link></li>
              <li><Link to="/promoter">Area Promoter</Link></li>
            </ul>
          </div>
          <div>
            <h5>Assistenza</h5>
            <ul>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/pagina/contatti">Contattaci</Link></li>
              <li><Link to="/account">Traccia la prenotazione</Link></li>
            </ul>
          </div>
          <div>
            <h5>Legale</h5>
            <ul>
              <li><Link to="/pagina/termini">Termini e condizioni</Link></li>
              <li><Link to="/pagina/privacy">Privacy</Link></li>
              <li><Link to="/pagina/cookie">Cookie</Link></li>
            </ul>
          </div>
        </div>
        <div className="payment-trust-row">
          <span>Pagamenti sicuri accettati:</span>
          <span className="payment-badge">💳 Carta</span>
          <span className="payment-badge">🅿️ PayPal</span>
          <span className="payment-badge">📲 Satispay</span>
        </div>
        <div className="footer-bottom">
          <span>© 2026 INBUS</span>
          <span>Progettato per viaggiare a ritmo di musica 🎸</span>
          <LinkPreferenzeCookie />
        </div>
      </footer>

      <CookieBanner />
    </>
  );
}
