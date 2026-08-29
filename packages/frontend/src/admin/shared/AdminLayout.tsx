import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haPermesso, type SessioneAdmin } from '../../api/auth';
import { eventiApi } from '../../api/eventi';
import { listaAttesaApi } from '../../api/listaAttesa';
import { richiesteRimborsoApi } from '../../api/richiesteRimborso';
import { chatApi } from '../../api/chat';

export type SezioneGestionale =
  | 'statistiche' | 'eventi' | 'vetrina' | 'calendario' | 'cestino' | 'partenze'
  | 'transazioni' | 'pagamenti' | 'coupon' | 'campagne' | 'lista-attesa' | 'offerte' | 'rimborsi' | 'variazioni'
  | 'utenti' | 'promoter' | 'organizzatori' | 'white-label' | 'tourleader'
  | 'fornitori' | 'fermate' | 'tragitti'
  | 'chat' | 'contenuti' | 'comunicazioni'
  | 'amministratori' | 'ruoli' | 'impostazioni' | 'template-email' | 'layout-biglietto' | 'testi-tooltip';

// Ogni voce dichiara il permesso che serve per vederla. Chi ha ruolo
// "owner" vede sempre tutto (haPermesso lo gestisce automaticamente).
const GRUPPI: { titolo: string; voci: { id: SezioneGestionale; label: string; permesso: string }[] }[] = [
  { titolo: 'Eventi', voci: [
    { id: 'eventi', label: 'Eventi', permesso: 'eventi.visualizza' },
    { id: 'calendario', label: 'Calendario', permesso: 'eventi.calendario' },
  ]},
  { titolo: 'Partenze', voci: [
    { id: 'partenze', label: 'Partenze', permesso: 'eventi.partenze' },
    { id: 'variazioni', label: 'Variazioni', permesso: 'prenotazioni.pagamenti' },
  ]},
  { titolo: 'Vendite', voci: [
    { id: 'transazioni', label: 'Prenotazioni', permesso: 'prenotazioni.transazioni' },
    { id: 'lista-attesa', label: "Lista d'attesa", permesso: 'eventi.partenze' },
  ]},
  { titolo: 'Marketing', voci: [
    { id: 'campagne', label: 'Campagne', permesso: 'campagne.gestisci' },
    { id: 'offerte', label: 'Offerte', permesso: 'offerte.gestisci' },
    { id: 'vetrina', label: 'Vetrina', permesso: 'eventi.vetrina' },
    { id: 'contenuti', label: 'Contenuti sito', permesso: 'pagine.gestisci' },
    { id: 'template-email', label: 'Testo email', permesso: 'template-email.gestisci' },
    { id: 'layout-biglietto', label: 'Layout biglietto', permesso: 'layout-biglietto.gestisci' },
  ]},
  { titolo: 'Customer Care', voci: [
    { id: 'pagamenti', label: 'Pagamenti', permesso: 'prenotazioni.pagamenti' },
    { id: 'rimborsi', label: 'Rimborsi', permesso: 'prenotazioni.pagamenti' },
    { id: 'utenti', label: 'Utenti', permesso: 'utenti.visualizza' },
    { id: 'coupon', label: 'Coupon', permesso: 'coupon.visualizza' },
    { id: 'chat', label: 'Chat', permesso: 'chat.visualizza' },
    { id: 'comunicazioni', label: 'Comunicazioni', permesso: 'eventi.crea' },
  ]},
  { titolo: 'Persone', voci: [
    { id: 'promoter', label: 'Promoter', permesso: 'promoter.visualizza' },
    { id: 'organizzatori', label: 'Organizzatori', permesso: 'organizzatori.visualizza' },
    { id: 'white-label', label: 'White Label', permesso: 'white-label.visualizza' },
    { id: 'tourleader', label: 'Tour Leader', permesso: 'tourleader.visualizza' },
  ]},
  { titolo: 'Logistica', voci: [
    { id: 'fornitori', label: 'Fornitori', permesso: 'fornitori.visualizza' },
    { id: 'fermate', label: 'Fermate', permesso: 'tragitti.visualizza' },
    { id: 'tragitti', label: 'Percorsi salvati', permesso: 'tragitti.visualizza' },
    { id: 'impostazioni', label: 'Impostazioni', permesso: 'impostazioni.gestisci' },
  ]},
  { titolo: 'Sistema', voci: [
    { id: 'amministratori', label: 'Amministratori', permesso: 'utenze.gestisci' },
    { id: 'ruoli', label: 'Ruoli', permesso: 'permessi.gestisci' },
    { id: 'cestino', label: 'Cestino', permesso: 'eventi.cestino' },
    { id: 'statistiche', label: 'Statistiche', permesso: 'statistiche.visualizza' },
    { id: 'testi-tooltip', label: 'Testi tooltip', permesso: 'impostazioni.gestisci' },
  ]},
];

export function AdminLayout({
  sessione, sezioneAttiva, onCambiaSezione, onVaiHome, onLogout, children,
}: {
  sessione: SessioneAdmin;
  sezioneAttiva: SezioneGestionale | 'home';
  onCambiaSezione: (s: SezioneGestionale) => void;
  onVaiHome: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  // Su schermi stretti i gruppi partono già chiusi (solo l'intestazione
  // compatta nello scorrimento orizzontale) — si aprono a tendina al
  // click, invece di mostrare sempre tutte le sottovoci in linea. Su
  // desktop restano aperti come sempre (sidebar verticale normale).
  const [gruppiCollassati, setGruppiCollassati] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined' || window.innerWidth > 860) return {};
    return Object.fromEntries(GRUPPI.map((g) => [g.titolo, true]));
  });
  const [allertePartenze, setAllertePartenze] = useState(0);
  const [eventiDaConfermare, setEventiDaConfermare] = useState(0);
  const [inAttesa, setInAttesa] = useState(0);
  const [rimborsiInAttesa, setRimborsiInAttesa] = useState(0);

  // Notifica sulla voce "Partenze": quante tratte, in tutti gli eventi,
  // hanno più passeggeri confermati dei posti previsti, più quanti
  // eventi hanno ancora almeno un tragitto "da confermare" (nessun bus
  // vero registrato — non possono nemmeno andare in vendita finché non
  // lo si fa). Solo per chi ha il permesso di vedere quella sezione.
  useEffect(() => {
    if (!haPermesso(sessione, 'eventi.partenze')) return;
    eventiApi.allertePartenze().then((r) => setAllertePartenze(r.conteggio)).catch(() => {});
    eventiApi.eventiDaConfermare().then((r) => setEventiDaConfermare(r.conteggio)).catch(() => {});
    listaAttesaApi.contaInAttesa().then((r) => setInAttesa(r.conteggio)).catch(() => {});
  }, [sessione]);

  // Separato dal blocco sopra apposta: i rimborsi dipendono da un
  // permesso diverso (pagamenti, non partenze) — un amministratore
  // potrebbe avere l'uno senza l'altro.
  useEffect(() => {
    if (!haPermesso(sessione, 'prenotazioni.pagamenti')) return;
    richiesteRimborsoApi.contaInAttesa().then((r) => setRimborsiInAttesa(r.conteggio)).catch(() => {});
  }, [sessione]);

  const [chatNonLette, setChatNonLette] = useState(0);
  useEffect(() => {
    if (!haPermesso(sessione, 'chat.visualizza')) return;
    chatApi.contaNonLette().then((r) => setChatNonLette(r.conteggio)).catch(() => {});
  }, [sessione]);

  // Il menu a tendina (solo mobile) deve comparire come un vero popup,
  // sovrapposto al contenuto sotto — non intrappolato nello scorrimento
  // orizzontale della nav (che lo taglierebbe via, essendo overflow-x
  // impostato). Misuro l'altezza VERA della sidebar (non una stima
  // fissa, che si romperebbe con font diversi o testi più lunghi) e la
  // uso per posizionare il popup con position:fixed, fuori da
  // qualunque contenitore con lo scroll.
  const sidebarRef = useRef<HTMLElement>(null);
  const qualcheGruppoAperto = Object.values(gruppiCollassati).some((v) => v === false);
  useEffect(() => {
    if (!qualcheGruppoAperto || !sidebarRef.current) return;
    const altezza = sidebarRef.current.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--menu-popup-top', `${altezza}px`);
  }, [qualcheGruppoAperto]);

  // Filtro sia i gruppi che le voci in base a ciò che l'utente loggato
  // può vedere: un gruppo compare solo se ha almeno una voce visibile.
  const gruppiVisibili = GRUPPI
    .map((gruppo) => ({ ...gruppo, voci: gruppo.voci.filter((v) => haPermesso(sessione, v.permesso)) }))
    .filter((gruppo) => gruppo.voci.length > 0);

  return (
    <div id="app" className="app-shell">
      {/* Sfondo semitrasparente dietro il menu a tendina aperto (solo
          mobile, il CSS lo nasconde su desktop) — tocco fuori per
          chiudere, rinforza l'effetto popup sopra il contenuto sotto. */}
      {qualcheGruppoAperto && (
        <div className="side-popup-sfondo" onClick={() => setGruppiCollassati((g) => Object.fromEntries(Object.keys(g).map((k) => [k, true])))} />
      )}
      <aside className="sidebar" ref={sidebarRef}>
        <div className="logo sidebar-logo" title="Torna alla Home" onClick={onVaiHome}>
          IN<span>BUS</span> <small>gestionale</small>
        </div>
        <nav className="side-nav">
          {gruppiVisibili.map((gruppo) => (
            <div className={`side-group${gruppiCollassati[gruppo.titolo] ? ' collassato' : ''}`} key={gruppo.titolo}>
              <button
                className="side-group-header"
                type="button"
                onClick={() => setGruppiCollassati((g) => {
                  const nuovoStato = !g[gruppo.titolo];
                  // Solo su schermi stretti: aprendo un gruppo, chiudo
                  // gli altri già aperti — evita più tendine
                  // sovrapposte insieme sullo stesso schermo piccolo.
                  // Su desktop restano indipendenti come sempre (più
                  // sezioni aperte contemporaneamente è il comportamento
                  // normale di una sidebar verticale).
                  if (typeof window !== 'undefined' && window.innerWidth <= 860 && nuovoStato === false) {
                    return Object.fromEntries(GRUPPI.map((gg) => [gg.titolo, gg.titolo !== gruppo.titolo]));
                  }
                  return { ...g, [gruppo.titolo]: nuovoStato };
                })}
              >
                {gruppo.titolo} <span className="group-caret">▾</span>
              </button>
              <div className="side-group-items">
                {gruppo.voci.map((voce) => (
                  <button
                    key={voce.id}
                    className={`side-btn${sezioneAttiva === voce.id ? ' active' : ''}`}
                    onClick={() => {
                      onCambiaSezione(voce.id);
                      if (typeof window !== 'undefined' && window.innerWidth <= 860) {
                        setGruppiCollassati((g) => ({ ...g, [gruppo.titolo]: true }));
                      }
                    }}
                  >
                    {voce.label}
                    {voce.id === 'partenze' && (allertePartenze + eventiDaConfermare) > 0 && (
                      <span
                        className="side-badge"
                        title={[
                          allertePartenze > 0 ? `${allertePartenze} tratta/e con posti superati` : null,
                          eventiDaConfermare > 0 ? `${eventiDaConfermare} evento/i con almeno un tragitto da confermare` : null,
                        ].filter(Boolean).join(' · ')}
                      >
                        {allertePartenze + eventiDaConfermare}
                      </span>
                    )}
                    {voce.id === 'lista-attesa' && inAttesa > 0 && (
                      <span className="side-badge" title={`${inAttesa} iscrizione/i in attesa di promozione`}>{inAttesa}</span>
                    )}
                    {voce.id === 'rimborsi' && rimborsiInAttesa > 0 && (
                      <span className="side-badge" title={`${rimborsiInAttesa} richiesta/e di rimborso da gestire`}>{rimborsiInAttesa}</span>
                    )}
                    {voce.id === 'chat' && chatNonLette > 0 && (
                      <span className="side-badge" title={`${chatNonLette} conversazione/i con messaggi non letti`}>{chatNonLette}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="side-utente-riga">
          <span className="side-utente-nome" title={sessione.email}>{sessione.nome}</span>
          <button className="btn btn-ghost side-logout" onClick={onLogout}>Esci</button>
        </div>
      </aside>

      <div className="main-wrap">
        <main>{children}</main>
      </div>
    </div>
  );
}
