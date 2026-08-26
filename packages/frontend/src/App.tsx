import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
import { HomePage } from './pages/HomePage';
import { AccountPage } from './pages/AccountPage';
import { CarrelloPage } from './pages/CarrelloPage';
import { PaginaPage } from './pages/PaginaPage';
import { PromoterPage } from './pages/PromoterPage';
import { PromoterPasswordDimenticataPage } from './pages/PromoterPasswordDimenticataPage';
import { PromoterReimpostaPasswordPage } from './pages/PromoterReimpostaPasswordPage';
import { OrganizzatorePage } from './pages/OrganizzatorePage';
import { OrganizzatorePasswordDimenticataPage } from './pages/OrganizzatorePasswordDimenticataPage';
import { OrganizzatoreReimpostaPasswordPage } from './pages/OrganizzatoreReimpostaPasswordPage';
import { TourLeaderPage } from './pages/TourLeaderPage';
import { FinalizzaListaAttesaPage } from './pages/FinalizzaListaAttesaPage';
import { CompletaSaldoPage } from './pages/CompletaSaldoPage';
import { OffertaPage } from './pages/OffertaPage';
import { EventoPage } from './pages/EventoPage';
import { WidgetPubblicoPage } from './pages/WidgetPubblicoPage';
import { TourLeaderLoginPage } from './pages/TourLeaderLoginPage';
import { TourLeaderCercaPage } from './pages/TourLeaderCercaPage';
import { TourLeaderPasswordDimenticataPage } from './pages/TourLeaderPasswordDimenticataPage';
import { TourLeaderReimpostaPasswordPage } from './pages/TourLeaderReimpostaPasswordPage';
import { TourLeaderBusListPage } from './pages/TourLeaderBusListPage';
import { TourLeaderScanPage } from './pages/TourLeaderScanPage';
import { AccediPage } from './pages/AccediPage';
import { PasswordDimenticataPage } from './pages/PasswordDimenticataPage';
import { ReimpostaPasswordPage } from './pages/ReimpostaPasswordPage';
import { RegistratiPage } from './pages/RegistratiPage';
import { VerificaEmailPage } from './pages/VerificaEmailPage';

export function App() {
  const location = useLocation();
  // React Router, di suo, NON riporta mai lo scroll in cima quando
  // cambi pagina (a differenza dei siti "tradizionali") — se eri
  // scorso in basso sulla pagina precedente, la nuova pagina si apre
  // restando a quella stessa altezza, invece che dall'inizio.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <Routes>
      <Route path="/" element={<Layout><HomePage /></Layout>} />
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
      <Route path="/finalizza/:token" element={<FinalizzaListaAttesaPage />} />
      <Route path="/completa-saldo/:pnr" element={<CompletaSaldoPage />} />
      <Route path="/offerta/:slug" element={<OffertaPage />} />
      <Route path="/eventi/:slug" element={<EventoPage key={location.pathname} />} />
      <Route path="/w/:publicWidgetId" element={<WidgetPubblicoPage />} />
      <Route path="/scansione/accedi" element={<TourLeaderLoginPage />} />
      <Route path="/scansione/password-dimenticata" element={<TourLeaderPasswordDimenticataPage />} />
      <Route path="/scansione/reimposta-password/:token" element={<TourLeaderReimpostaPasswordPage />} />
      <Route path="/scansione" element={<TourLeaderBusListPage />} />
      <Route path="/scansione/cerca" element={<TourLeaderCercaPage />} />
      <Route path="/scansione/bus/:busId" element={<TourLeaderScanPage />} />
      <Route path="/accedi" element={<AccediPage />} />
      <Route path="/password-dimenticata" element={<PasswordDimenticataPage />} />
      <Route path="/reimposta-password/:token" element={<ReimpostaPasswordPage />} />
      <Route path="/registrati" element={<RegistratiPage />} />
      <Route path="/verifica-email/:token" element={<VerificaEmailPage />} />
    </Routes>
  );
}
