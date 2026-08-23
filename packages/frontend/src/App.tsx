import { Routes, Route } from 'react-router-dom';
import { Layout } from './Layout';
import { HomePage } from './pages/HomePage';
import { AccountPage } from './pages/AccountPage';
import { PaginaPage } from './pages/PaginaPage';
import { PromoterPage } from './pages/PromoterPage';
import { PromoterPasswordDimenticataPage } from './pages/PromoterPasswordDimenticataPage';
import { PromoterReimpostaPasswordPage } from './pages/PromoterReimpostaPasswordPage';
import { TourLeaderPage } from './pages/TourLeaderPage';
import { FinalizzaListaAttesaPage } from './pages/FinalizzaListaAttesaPage';
import { CompletaSaldoPage } from './pages/CompletaSaldoPage';
import { OffertaPage } from './pages/OffertaPage';
import { EventoPage } from './pages/EventoPage';
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
  return (
    <Routes>
      <Route path="/" element={<Layout><HomePage /></Layout>} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/faq" element={<PaginaPage chiaveFissa="faq" />} />
      <Route path="/pagina/:chiave" element={<PaginaPage />} />
      <Route path="/promoter" element={<PromoterPage />} />
      <Route path="/promoter/password-dimenticata" element={<PromoterPasswordDimenticataPage />} />
      <Route path="/promoter/reimposta-password/:token" element={<PromoterReimpostaPasswordPage />} />
      <Route path="/tour-leader" element={<TourLeaderPage />} />
      <Route path="/finalizza/:token" element={<FinalizzaListaAttesaPage />} />
      <Route path="/completa-saldo/:pnr" element={<CompletaSaldoPage />} />
      <Route path="/offerta/:slug" element={<OffertaPage />} />
      <Route path="/eventi/:slug" element={<EventoPage />} />
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
