import { useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminLayout, type SezioneGestionale } from './shared/AdminLayout';
import { AdminHome } from './screens/AdminHome';
import { AdminDashboard } from './AdminDashboard';
import { EventiScreen } from './screens/EventiScreen';
import { VetrinaScreen } from './screens/VetrinaScreen';
import { CalendarioScreen } from './screens/CalendarioScreen';
import { CestinoScreen } from './screens/CestinoScreen';
import { TransazioniScreen } from './screens/TransazioniScreen';
import { PagamentiScreen } from './screens/PagamentiScreen';
import { UtentiScreen } from './screens/UtentiScreen';
import { FornitoriScreen } from './screens/FornitoriScreen';
import { TragittiScreen } from './screens/TragittiScreen';
import { PromoterScreen } from './screens/PromoterScreen';
import { TourLeaderScreen } from './screens/TourLeaderScreen';
import { CouponScreen } from './screens/CouponScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ContenutiScreen } from './screens/ContenutiScreen';
import { AmministratoriScreen } from './screens/AmministratoriScreen';

function StatisticheSenzaHeader() {
  return <AdminDashboard onLogout={() => {}} soloContenuto />;
}

const SCHERMATE: Record<SezioneGestionale, React.ComponentType> = {
  statistiche: StatisticheSenzaHeader,
  eventi: EventiScreen,
  vetrina: VetrinaScreen,
  calendario: CalendarioScreen,
  cestino: CestinoScreen,
  transazioni: TransazioniScreen,
  pagamenti: PagamentiScreen,
  utenti: UtentiScreen,
  fornitori: FornitoriScreen,
  tragitti: TragittiScreen,
  promoter: PromoterScreen,
  tourleader: TourLeaderScreen,
  coupon: CouponScreen,
  chat: ChatScreen,
  contenuti: ContenutiScreen,
  amministratori: AmministratoriScreen,
};

export function AdminApp() {
  const [loggato, setLoggato] = useState(() => !!localStorage.getItem('inbus_admin_token'));
  const [sezione, setSezione] = useState<SezioneGestionale | 'home'>('home');

  function logout() {
    localStorage.removeItem('inbus_admin_token');
    setLoggato(false);
  }

  if (!loggato) return <AdminLogin onLogin={() => setLoggato(true)} />;

  return (
    <AdminLayout sezioneAttiva={sezione} onCambiaSezione={setSezione} onVaiHome={() => setSezione('home')} onLogout={logout}>
      {sezione === 'home' ? <AdminHome onVaiA={setSezione} /> : (() => { const Schermata = SCHERMATE[sezione]; return <Schermata />; })()}
    </AdminLayout>
  );
}
