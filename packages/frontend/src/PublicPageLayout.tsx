import type { ReactNode } from 'react';
import { LogoOnWay } from './features/LogoOnWay';
import { Footer } from './features/Footer';
import { CookieBanner } from './features/CookieBanner';

/** Guscio ridotto (solo logo) con lo stesso piè di pagina e lo stesso
 *  banner cookie del sito. Resta per compatibilità: le pagine
 *  editoriali (PaginaPage) oggi usano il Layout completo. Il wrapper
 *  .pagina-editoriale è lo scope di faq.css e pagina.css. */
export function PublicPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pagina-editoriale">
      <header className="header-sito">
        <div className="container header-riga">
          <LogoOnWay />
        </div>
      </header>

      {children}

      <Footer />
      <CookieBanner />
    </div>
  );
}
