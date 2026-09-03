import { useEffect, useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminLayout, type SezioneGestionale } from './shared/AdminLayout';
import { AdminHome } from './screens/AdminHome';
import { AdminDashboard } from './AdminDashboard';
import { SessioneContext } from './shared/SessioneContext';
import { NavigazioneContext } from './shared/NavigazioneContext';
import { EventiScreen } from './screens/EventiScreen';
import { VetrinaScreen } from './screens/VetrinaScreen';
import { CalendarioScreen } from './screens/CalendarioScreen';
import { CestinoScreen } from './screens/CestinoScreen';
import { PrenotazioniScreen } from './screens/PrenotazioniScreen';
import { PagamentiScreen } from './screens/PagamentiScreen';
import { RimborsiScreen } from './screens/RimborsiScreen';
import { VariazioniScreen } from './screens/VariazioniScreen';
import { UtentiScreen } from './screens/UtentiScreen';
import { FornitoriScreen } from './screens/FornitoriScreen';
import { PercorsiSalvatiScreen } from './screens/PercorsiSalvatiScreen';
import { FermateScreen } from './screens/FermateScreen';
import { PromoterScreen } from './screens/PromoterScreen';
import { OrganizzatoriScreen } from './screens/OrganizzatoriScreen';
import { WhiteLabelScreen } from './screens/WhiteLabelScreen';
import { TourLeaderScreen } from './screens/TourLeaderScreen';
import { CouponScreen } from './screens/CouponScreen';
import { CampagneScreen } from './screens/CampagneScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ComunicazioniScreen } from './screens/ComunicazioniScreen';
import { ContenutiScreen } from './screens/ContenutiScreen';
import { AmministratoriScreen } from './screens/AmministratoriScreen';
import { RuoliScreen } from './screens/RuoliScreen';
import { TestiTooltipScreen } from './screens/TestiTooltipScreen';
import { PartenzeOrariScreen, PartenzePrezziScreen, PartenzeDaConfermareScreen, PartenzeConfermatoScreen, PartenzePassateScreen } from './screens/PartenzeScreen';
import { LineeTragittoScreen } from './screens/LineeTragittoScreen';
import { ListaAttesaScreen } from './screens/ListaAttesaScreen';
import { OfferteScreen } from './screens/OfferteScreen';
import { ImpostazioniScreen } from './screens/ImpostazioniScreen';
import { TemplateEmailScreen } from './screens/TemplateEmailScreen';
import { LayoutBigliettoScreen } from './screens/LayoutBigliettoScreen';
import { AnalisiPercorsiScreen } from './screens/beta/AnalisiPercorsiScreen';
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
  rimborsi: RimborsiScreen,
  variazioni: VariazioniScreen,
  utenti: UtentiScreen,
  fornitori: FornitoriScreen,
  fermate: FermateScreen,
  tragitti: PercorsiSalvatiScreen,
  promoter: PromoterScreen,
  organizzatori: OrganizzatoriScreen,
  'white-label': WhiteLabelScreen,
  tourleader: TourLeaderScreen,
  coupon: CouponScreen,
  campagne: CampagneScreen,
  'lista-attesa': ListaAttesaScreen,
  offerte: OfferteScreen,
  chat: ChatScreen,
  comunicazioni: ComunicazioniScreen,
  contenuti: ContenutiScreen,
  amministratori: AmministratoriScreen,
  ruoli: RuoliScreen,
  'testi-tooltip': TestiTooltipScreen,
  'partenze-orari': PartenzeOrariScreen,
  'partenze-prezzi': PartenzePrezziScreen,
  'partenze-da-confermare': PartenzeDaConfermareScreen,
  'partenze-confermato': PartenzeConfermatoScreen,
  'partenze-passate': PartenzePassateScreen,
  linee: LineeTragittoScreen,
  impostazioni: ImpostazioniScreen,
  'template-email': TemplateEmailScreen,
  'layout-biglietto': LayoutBigliettoScreen,
  'beta-tragitti-vicini': AnalisiPercorsiScreen,
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
  rimborsi: 'prenotazioni.pagamenti',
  variazioni: 'prenotazioni.pagamenti',
  utenti: 'utenti.visualizza',
  fornitori: 'fornitori.visualizza',
  fermate: 'tragitti.visualizza',
  tragitti: 'tragitti.visualizza',
  promoter: 'promoter.visualizza',
  organizzatori: 'organizzatori.visualizza',
  'white-label': 'white-label.visualizza',
  tourleader: 'tourleader.visualizza',
  coupon: 'coupon.visualizza',
  campagne: 'campagne.gestisci',
  'lista-attesa': 'eventi.partenze',
  offerte: 'offerte.gestisci',
  chat: 'chat.visualizza',
  comunicazioni: 'eventi.crea',
  contenuti: 'pagine.gestisci',
  amministratori: 'utenze.gestisci',
  ruoli: 'permessi.gestisci',
  'testi-tooltip': 'impostazioni.gestisci',
  'partenze-orari': 'eventi.partenze',
  'partenze-prezzi': 'eventi.partenze',
  'partenze-da-confermare': 'eventi.partenze',
  'partenze-confermato': 'eventi.partenze',
  'partenze-passate': 'eventi.partenze',
  linee: 'eventi.crea',
  impostazioni: 'impostazioni.gestisci',
  'template-email': 'template-email.gestisci',
  'layout-biglietto': 'layout-biglietto.gestisci',
  'beta-tragitti-vicini': 'eventi.partenze',
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
  const [sessioneScaduta, setSessioneScaduta] = useState(false);
  const [caricamentoIniziale, setCaricamentoIniziale] = useState(true);
  const [sezione, setSezioneState] = useState<SezioneGestionale | 'home'>(leggiSezioneDaUrl);

  function setSezione(s: SezioneGestionale | 'home', parametriExtra?: Record<string, string | null>) {
    setSezioneState(s);
    const url = new URL(window.location.href);
    if (s === 'home') url.searchParams.delete('sezione');
    else url.searchParams.set('sezione', s);
    if (parametriExtra) {
      for (const [chiave, valore] of Object.entries(parametriExtra)) {
        if (valore === null) url.searchParams.delete(chiave);
        else url.searchParams.set(chiave, valore);
      }
    }
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

  // Il client API (api/client.ts) segnala così un 401 su QUALUNQUE
  // chiamata — il token è già stato tolto da localStorage lì, qui basta
  // riportare la sessione a "non loggato": AdminApp torna da sola alla
  // schermata di accesso, senza un ricaricamento completo della pagina.
  useEffect(() => {
    function allo401() { setSessione(null); setSezione('home'); setSessioneScaduta(true); }
    window.addEventListener('inbus-401-admin', allo401);
    return () => window.removeEventListener('inbus-401-admin', allo401);
  }, []);

  function logout() {
    localStorage.removeItem('inbus_admin_token');
    setSessione(null);
    setSezione('home');
  }

  function cambiaSezione(s: SezioneGestionale, parametriExtra?: Record<string, string | null>) {
    if (sessione && !haPermesso(sessione, PERMESSO_SEZIONE[s])) return; // difesa extra, oltre al menu già filtrato
    setSezione(s, parametriExtra);
    // Cambiando sezione si riparte sempre dall'inizio — altrimenti, se
    // si era scorsa in basso la sezione precedente, ci si ritrova nel
    // mezzo di quella nuova senza nessun punto di riferimento (capita
    // spesso da mobile, dove lo spazio è poco e si scorre di più).
    window.scrollTo(0, 0);
  }

  if (caricamentoIniziale) return null; // evita un lampo di schermata di login mentre verifichiamo il token
  if (!sessione) return <AdminLogin onLogin={setSessione} messaggioIniziale={sessioneScaduta ? 'La tua sessione è scaduta — accedi di nuovo.' : undefined} />;

  return (
    <SessioneContext.Provider value={sessione}>
      <NavigazioneContext.Provider value={cambiaSezione}>
        <AdminLayout sessione={sessione} sezioneAttiva={sezione} onCambiaSezione={cambiaSezione} onVaiHome={() => setSezione('home')} onLogout={logout}>
          {sezione === 'home' ? <AdminHome onVaiA={cambiaSezione} /> : (() => { const Schermata = SCHERMATE[sezione]; return <Schermata />; })()}
        </AdminLayout>
      </NavigazioneContext.Provider>
    </SessioneContext.Provider>
  );
}
