import { useEffect, useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminLayout, type SezioneGestionale } from './shared/AdminLayout';
import { AdminHome } from './screens/AdminHome';
import { AdminDashboard } from './AdminDashboard';
import { SessioneContext } from './shared/SessioneContext';
import { EventiScreen } from './screens/EventiScreen';
import { VetrinaScreen } from './screens/VetrinaScreen';
import { CalendarioScreen } from './screens/CalendarioScreen';
import { CestinoScreen } from './screens/CestinoScreen';
import { PrenotazioniScreen } from './screens/PrenotazioniScreen';
import { PagamentiScreen } from './screens/PagamentiScreen';
import { UtentiScreen } from './screens/UtentiScreen';
import { FornitoriScreen } from './screens/FornitoriScreen';
import { TragittiScreen } from './screens/TragittiScreen';
import { PromoterScreen } from './screens/PromoterScreen';
import { TourLeaderScreen } from './screens/TourLeaderScreen';
import { CouponScreen } from './screens/CouponScreen';
import { CampagneScreen } from './screens/CampagneScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ContenutiScreen } from './screens/ContenutiScreen';
import { AmministratoriScreen } from './screens/AmministratoriScreen';
import { RuoliScreen } from './screens/RuoliScreen';
import { PartenzeScreen } from './screens/PartenzeScreen';
import { ImpostazioniScreen } from './screens/ImpostazioniScreen';
import { authApi, haPermesso, type SessioneAdmin } from '../api/auth';

function StatisticheSenzaHeader() {
  return <AdminDashboard onLogout={() => {}} soloContenuto />;
}

const SCHERMATE: Record<SezioneGestionale, React.ComponentType> = {
  statistiche: StatisticheSenzaHeader,
  eventi: EventiScreen,
  vetrina: VetrinaScreen,
  calendario: CalendarioScreen,
  cestino: CestinoScreen,
  transazioni: PrenotazioniScreen,
  pagamenti: PagamentiScreen,
  utenti: UtentiScreen,
  fornitori: FornitoriScreen,
  tragitti: TragittiScreen,
  promoter: PromoterScreen,
  tourleader: TourLeaderScreen,
  coupon: CouponScreen,
  campagne: CampagneScreen,
  chat: ChatScreen,
  contenuti: ContenutiScreen,
  amministratori: AmministratoriScreen,
  ruoli: RuoliScreen,
  partenze: PartenzeScreen,
  impostazioni: ImpostazioniScreen,
};

// Permesso richiesto per ogni sezione, usato per bloccare l'accesso
// diretto (non solo nascondere la voce di menu) se qualcuno perde un
// permesso mentre è già loggato.
const PERMESSO_SEZIONE: Record<SezioneGestionale, string> = {
  statistiche: 'statistiche.visualizza',
  eventi: 'eventi.visualizza',
  vetrina: 'eventi.vetrina',
  calendario: 'eventi.calendario',
  cestino: 'eventi.cestino',
  transazioni: 'prenotazioni.transazioni',
  pagamenti: 'prenotazioni.pagamenti',
  utenti: 'utenti.visualizza',
  fornitori: 'fornitori.visualizza',
  tragitti: 'tragitti.visualizza',
  promoter: 'promoter.visualizza',
  tourleader: 'tourleader.visualizza',
  coupon: 'coupon.visualizza',
  campagne: 'campagne.gestisci',
  chat: 'chat.visualizza',
  contenuti: 'pagine.gestisci',
  amministratori: 'utenze.gestisci',
  ruoli: 'permessi.gestisci',
  partenze: 'eventi.partenze',
  impostazioni: 'impostazioni.gestisci',
};

/** Legge la sezione attiva dall'indirizzo (?sezione=...) — così se
 *  l'amministratore ricarica la pagina (o usa avanti/indietro del
 *  browser) resta dove si trovava, invece di tornare sempre alla home
 *  del gestionale. Il gestionale è un'app separata dal sito (niente
 *  react-router qui dentro), quindi uso direttamente le API del browser. */
function leggiSezioneDaUrl(): SezioneGestionale | 'home' {
  const valore = new URLSearchParams(window.location.search).get('sezione');
  if (valore && valore in SCHERMATE) return valore as SezioneGestionale;
  return 'home';
}

export function AdminApp() {
  const [sessione, setSessione] = useState<SessioneAdmin | null>(null);
  const [caricamentoIniziale, setCaricamentoIniziale] = useState(true);
  const [sezione, setSezioneState] = useState<SezioneGestionale | 'home'>(leggiSezioneDaUrl);

  function setSezione(s: SezioneGestionale | 'home') {
    setSezioneState(s);
    const url = new URL(window.location.href);
    if (s === 'home') url.searchParams.delete('sezione');
    else url.searchParams.set('sezione', s);
    window.history.replaceState(null, '', url);
  }

  // Al primo caricamento, se c'è un token salvato, ricalcola la sessione
  // (permessi inclusi) dal server invece di fidarsi di dati vecchi in
  // memoria — così un cambio di permessi si vede anche solo ricaricando
  // la pagina, senza dover rifare login.
  useEffect(() => {
    const token = localStorage.getItem('inbus_admin_token');
    if (!token) { setCaricamentoIniziale(false); return; }
    authApi.me()
      .then(({ admin }) => setSessione(admin))
      .catch(() => localStorage.removeItem('inbus_admin_token'))
      .finally(() => setCaricamentoIniziale(false));
  }, []);

  function logout() {
    localStorage.removeItem('inbus_admin_token');
    setSessione(null);
    setSezione('home');
  }

  function cambiaSezione(s: SezioneGestionale) {
    if (sessione && !haPermesso(sessione, PERMESSO_SEZIONE[s])) return; // difesa extra, oltre al menu già filtrato
    setSezione(s);
  }

  if (caricamentoIniziale) return null; // evita un lampo di schermata di login mentre verifichiamo il token
  if (!sessione) return <AdminLogin onLogin={setSessione} />;

  return (
    <SessioneContext.Provider value={sessione}>
      <AdminLayout sessione={sessione} sezioneAttiva={sezione} onCambiaSezione={cambiaSezione} onVaiHome={() => setSezione('home')} onLogout={logout}>
        {sezione === 'home' ? <AdminHome onVaiA={cambiaSezione} /> : (() => { const Schermata = SCHERMATE[sezione]; return <Schermata />; })()}
      </AdminLayout>
    </SessioneContext.Provider>
  );
}
