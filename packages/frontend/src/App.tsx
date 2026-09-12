import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
// Nel pacchetto principale: le pagine del percorso d'acquisto e l'accesso.
import { HomePage } from './pages/HomePage';
import { CarrelloPage } from './pages/CarrelloPage';
import { BundleListaPage } from './pages/BundleListaPage';
import { BundlePage } from './pages/BundlePage';
import { TourPage } from './pages/TourPage';
import { PromoterRedirectPage } from './pages/PromoterRedirectPage';
import { OffertaPage } from './pages/OffertaPage';
import { EventoPage } from './pages/EventoPage';
import { AccediPage } from './pages/AccediPage';
import { PasswordDimenticataPage } from './pages/PasswordDimenticataPage';
import { ReimpostaPasswordPage } from './pages/ReimpostaPasswordPage';
import { RegistratiPage } from './pages/RegistratiPage';
import { VerificaEmailPage } from './pages/VerificaEmailPage';
import { NonTrovataPage } from './pages/NonTrovataPage';
import { comportamentoScorrimento } from './shared/movimento';

/** React.lazy vuole un export default: le pagine hanno export con nome. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aRichiesta<M extends Record<string, ComponentType<any>>>(carica: () => Promise<M>, nome: keyof M) {
  return lazy(() => carica().then((m) => ({ default: m[nome] })));
}

// Caricate a richiesta: aree riservate, partner, tour leader, fornitori,
// widget, pagine CMS e pagine raggiunte da un link email.
const AccountPage = aRichiesta(() => import('./pages/AccountPage'), 'AccountPage');
const PaginaPage = aRichiesta(() => import('./pages/PaginaPage'), 'PaginaPage');
const PromoterPage = aRichiesta(() => import('./pages/PromoterPage'), 'PromoterPage');
const PromoterPasswordDimenticataPage = aRichiesta(() => import('./pages/PromoterPasswordDimenticataPage'), 'PromoterPasswordDimenticataPage');
const PromoterReimpostaPasswordPage = aRichiesta(() => import('./pages/PromoterReimpostaPasswordPage'), 'PromoterReimpostaPasswordPage');
const OrganizzatorePage = aRichiesta(() => import('./pages/OrganizzatorePage'), 'OrganizzatorePage');
const OrganizzatorePasswordDimenticataPage = aRichiesta(() => import('./pages/OrganizzatorePasswordDimenticataPage'), 'OrganizzatorePasswordDimenticataPage');
const OrganizzatoreReimpostaPasswordPage = aRichiesta(() => import('./pages/OrganizzatoreReimpostaPasswordPage'), 'OrganizzatoreReimpostaPasswordPage');
const TourLeaderPage = aRichiesta(() => import('./pages/TourLeaderPage'), 'TourLeaderPage');
const FornitoreRegistrazionePage = aRichiesta(() => import('./pages/FornitoreRegistrazionePage'), 'FornitoreRegistrazionePage');
const FornitorePreventivoPage = aRichiesta(() => import('./pages/FornitorePreventivoPage'), 'FornitorePreventivoPage');
const FinalizzaListaAttesaPage = aRichiesta(() => import('./pages/FinalizzaListaAttesaPage'), 'FinalizzaListaAttesaPage');
const VariazionePage = aRichiesta(() => import('./pages/VariazionePage'), 'VariazionePage');
const CompletaSaldoPage = aRichiesta(() => import('./pages/CompletaSaldoPage'), 'CompletaSaldoPage');
const WidgetPubblicoPage = aRichiesta(() => import('./pages/WidgetPubblicoPage'), 'WidgetPubblicoPage');
const TourLeaderLoginPage = aRichiesta(() => import('./pages/TourLeaderLoginPage'), 'TourLeaderLoginPage');
const TourLeaderCercaPage = aRichiesta(() => import('./pages/TourLeaderCercaPage'), 'TourLeaderCercaPage');
const TourLeaderPasswordDimenticataPage = aRichiesta(() => import('./pages/TourLeaderPasswordDimenticataPage'), 'TourLeaderPasswordDimenticataPage');
const TourLeaderReimpostaPasswordPage = aRichiesta(() => import('./pages/TourLeaderReimpostaPasswordPage'), 'TourLeaderReimpostaPasswordPage');
const TourLeaderBusListPage = aRichiesta(() => import('./pages/TourLeaderBusListPage'), 'TourLeaderBusListPage');
const TourLeaderScanPage = aRichiesta(() => import('./pages/TourLeaderScanPage'), 'TourLeaderScanPage');
const TourLeaderPasseggeriPage = aRichiesta(() => import('./pages/TourLeaderPasseggeriPage'), 'TourLeaderPasseggeriPage');

export function App() {
  const location = useLocation();
  // React Router, di suo, NON riporta lo scroll in cima quando cambi
  // pagina: la nuova pagina si aprirebbe alla stessa altezza della precedente.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // React Router NON gestisce da solo lo scorrimento a un'ancora (es.
  // "/#eventi"). Il piccolo ritardo dà tempo alla pagina di comparire.
  useEffect(() => {
    if (!location.hash) return;
    const id = setTimeout(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: comportamentoScorrimento() });
    }, 80);
    return () => clearTimeout(id);
  }, [location.pathname, location.hash]);

  return (
    <Suspense fallback={<p className="caricamento" role="status">Carico…</p>}>
      <Routes>
        {/* <main> qui e non dentro HomePage: l'account cliente ("Scopri eventi")
            mostra la home dentro il proprio <main>, e non vanno annidati. */}
        <Route path="/" element={<Layout><main><HomePage /></main></Layout>} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/carrello" element={<Layout><CarrelloPage /></Layout>} />
        <Route path="/faq" element={<PaginaPage chiaveFissa="faq" />} />
        <Route path="/pagina/:chiave" element={<PaginaPage />} />
        <Route path="/promoter" element={<PromoterPage />} />
        <Route path="/promoter/password-dimenticata" element={<PromoterPasswordDimenticataPage />} />
        <Route path="/promoter/reimposta-password/:token" element={<PromoterReimpostaPasswordPage />} />
        <Route path="/organizzatore" element={<OrganizzatorePage />} />
        <Route path="/organizzatore/password-dimenticata" element={<OrganizzatorePasswordDimenticataPage />} />
        <Route path="/organizzatore/reimposta-password/:token" element={<OrganizzatoreReimpostaPasswordPage />} />
        <Route path="/tour-leader" element={<TourLeaderPage />} />
        <Route path="/fornitore/registrati" element={<FornitoreRegistrazionePage />} />
        <Route path="/fornitore/preventivo/:token" element={<FornitorePreventivoPage />} />
        <Route path="/finalizza/:token" element={<FinalizzaListaAttesaPage />} />
        <Route path="/variazione/:token" element={<VariazionePage />} />
        <Route path="/completa-saldo/:pnr" element={<CompletaSaldoPage />} />
        <Route path="/offerta/:slug" element={<OffertaPage />} />
        <Route path="/eventi/:slug" element={<EventoPage key={location.pathname} />} />
        <Route path="/bundle" element={<Layout><BundleListaPage /></Layout>} />
        <Route path="/bundle/:slug" element={<BundlePage key={location.pathname} />} />
        <Route path="/tour/:slug" element={<TourPage key={location.pathname} />} />
        <Route path="/p/:codice" element={<PromoterRedirectPage />} />
        <Route path="/w/:publicWidgetId" element={<WidgetPubblicoPage />} />
        <Route path="/scansione/accedi" element={<TourLeaderLoginPage />} />
        <Route path="/scansione/password-dimenticata" element={<TourLeaderPasswordDimenticataPage />} />
        <Route path="/scansione/reimposta-password/:token" element={<TourLeaderReimpostaPasswordPage />} />
        <Route path="/scansione" element={<TourLeaderBusListPage />} />
        <Route path="/scansione/cerca" element={<TourLeaderCercaPage />} />
        <Route path="/scansione/bus/:busId" element={<TourLeaderScanPage />} />
        <Route path="/scansione/bus/:busId/passeggeri" element={<TourLeaderPasseggeriPage />} />
        <Route path="/accedi" element={<AccediPage />} />
        <Route path="/password-dimenticata" element={<PasswordDimenticataPage />} />
        <Route path="/reimposta-password/:token" element={<ReimpostaPasswordPage />} />
        <Route path="/registrati" element={<RegistratiPage />} />
        <Route path="/verifica-email/:token" element={<VerificaEmailPage />} />
        <Route path="*" element={<NonTrovataPage />} />
      </Routes>
    </Suspense>
  );
}
