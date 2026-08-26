import { useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CookieBanner, LinkPreferenzeCookie } from './features/CookieBanner';
import { clienteLoggato } from './features/clienteSessione';

export function Layout({ children }: { children: ReactNode }) {
  const [menuMobileAperto, setMenuMobileAperto] = useState(false);
  const loggato = clienteLoggato();
  const location = useLocation();
  const inHomepage = location.pathname === '/';
  // La ricerca vive nell'URL (?q=...), non in uno stato locale — così
  // header (qui) e homepage possono leggerla e scriverla entrambe,
  // senza doverla far viaggiare come prop tra due componenti che
  // altrimenti non si parlerebbero (Layout avvolge OGNI pagina,
  // HomePage è solo una di quelle).
  const [searchParams, setSearchParams] = useSearchParams();
  const testoRicerca = searchParams.get('q') ?? '';

  return (
    <>
      <header>
        <Link to="/" className="logo">IN<span>BUS</span></Link>
        <nav className="links">
          <Link to="/#consigliati">Eventi Consigliati</Link>
          <Link to="/#eventi">Eventi</Link>
        </nav>
        {inHomepage && (
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
        )}
        <div className="nav-actions">
          <Link className="btn btn-ghost desktop-only" to={loggato ? '/account' : '/accedi'}>{loggato ? 'Il mio account' : 'Accedi'}</Link>
          <button className="burger" onClick={() => setMenuMobileAperto(!menuMobileAperto)}>☰</button>
        </div>
      </header>
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
