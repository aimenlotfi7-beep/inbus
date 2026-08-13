import { Routes, Route } from 'react-router-dom';
import { Layout } from './Layout';
import { HomePage } from './pages/HomePage';
import { AccountPage } from './pages/AccountPage';
import { PaginaPage } from './pages/PaginaPage';
import { PromoterPage } from './pages/PromoterPage';
import { TourLeaderPage } from './pages/TourLeaderPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><HomePage /></Layout>} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/faq" element={<PaginaPage chiaveFissa="faq" />} />
      <Route path="/pagina/:chiave" element={<PaginaPage />} />
      <Route path="/promoter" element={<PromoterPage />} />
      <Route path="/tour-leader" element={<TourLeaderPage />} />
    </Routes>
  );
}
