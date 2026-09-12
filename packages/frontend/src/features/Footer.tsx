import { Link } from 'react-router-dom';
import { LogoOnWay } from './LogoOnWay';
import { LinkPreferenzeCookie } from './CookieBanner';

/** Il piè di pagina del sito pubblico, uno solo: lo montano Layout e
 *  PublicPageLayout. Cinque colonne (marchio, Eventi, Assistenza, OnWay,
 *  Legale) che diventano due sui tablet e una sui telefoni (header.css).
 *  Niente riga "pagamenti accettati": nessun pagamento online è
 *  collegato, prometterlo qui sarebbe falso. */
export function Footer() {
  return (
    <footer id="assistenza">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-marchio">
            <LogoOnWay come="testo" />
            <p>Non vendiamo un viaggio. Portiamo le persone verso un'esperienza.</p>
          </div>
          <div>
            <h5>Eventi</h5>
            <ul>
              <li><Link to="/#eventi">Tutti gli eventi</Link></li>
              <li><Link to="/bundle">Bundle</Link></li>
              <li><Link to="/#come-funziona">Come funziona</Link></li>
            </ul>
          </div>
          <div>
            <h5>Assistenza</h5>
            <ul>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/pagina/contatti">Contattaci</Link></li>
              <li><Link to="/account">I miei viaggi</Link></li>
            </ul>
          </div>
          <div>
            <h5>OnWay</h5>
            <ul>
              <li><Link to="/pagina/chisiamo">Chi siamo</Link></li>
              <li><Link to="/tour-leader">Lavora con noi</Link></li>
              <li><Link to="/promoter">Area promoter</Link></li>
              <li><Link to="/organizzatore">Area organizzatore</Link></li>
            </ul>
          </div>
          <div>
            <h5>Legale</h5>
            <ul>
              <li><Link to="/pagina/termini">Termini e condizioni</Link></li>
              <li><Link to="/pagina/privacy">Privacy</Link></li>
              <li><Link to="/pagina/cookie">Cookie</Link></li>
              <li><LinkPreferenzeCookie /></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 OnWay</span>
          <span>Tutti i marchi citati sono di proprietà dei rispettivi titolari.</span>
        </div>
      </div>
    </footer>
  );
}
