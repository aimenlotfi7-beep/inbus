import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Header semplificato (solo logo, senza nav/burger) + lo stesso footer
 *  del sito — struttura reale usata da faq.html e pagina.html nella V18. */
export function PublicPageLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header>
        <Link className="logo" to="/"><img src="/logo-ooneway-header.png" alt="OoneWay" /></Link>
      </header>

      {children}

      <footer id="assistenza">
        <div className="footer-grid">
          <div>
            <Link className="logo" to="/"><img src="/logo-ooneway-header.png" alt="OoneWay" style={{ height: 36 }} /></Link>
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
              <li><Link to="/pagina/termini">Regolamento di viaggio</Link></li>
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
          <span>© 2026 OoneWay — mockup di progetto, tutti i marchi citati sono di proprietà dei rispettivi titolari.</span>
          <span>Progettato per viaggiare a ritmo di musica 🎸</span>
        </div>
      </footer>
    </>
  );
}
