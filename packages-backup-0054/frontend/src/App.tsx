import { Routes, Route } from 'react-router-dom';
import { Layout } from './Layout';
import { HomePage } from './pages/HomePage';
import { AccountPage } from './pages/AccountPage';
import { PaginaPage } from './pages/PaginaPage';
import { PromoterPage } from './pages/PromoterPage';
import { TourLeaderPage } from './pages/TourLeaderPage';
import { FinalizzaListaAttesaPage } from './pages/FinalizzaListaAttesaPage';
import { CompletaSaldoPage } from './pages/CompletaSaldoPage';
import { OffertaPage } from './pages/OffertaPage';
import { EventoPage } from './pages/EventoPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><HomePage /></Layout>} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/faq" element={<PaginaPage chiaveFissa="faq" />} />
      <Route path="/pagina/:chiave" element={<PaginaPage />} />
      <Route path="/promoter" element={<PromoterPage />} />
      <Route path="/tour-leader" element={<TourLeaderPage />} />
      <Route path="/finalizza/:token" element={<FinalizzaListaAttesaPage />} />
      <Route path="/completa-saldo/:pnr" element={<CompletaSaldoPage />} />
      <Route path="/offerta/:slug" element={<OffertaPage />} />
      <Route path="/eventi/:slug" element={<EventoPage />} />
    </Routes>
  );
}
