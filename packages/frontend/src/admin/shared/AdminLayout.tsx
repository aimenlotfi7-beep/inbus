import { useEffect, useState, type ReactNode } from 'react';
import { haPermesso, type SessioneAdmin } from '../../api/auth';
import { LogoOnWay } from '../../features/LogoOnWay';
import { eventiApi } from '../../api/eventi';
import { listaAttesaApi } from '../../api/listaAttesa';
import { richiesteRimborsoApi } from '../../api/richiesteRimborso';
import { fornitoriApi } from '../../api/fornitori';
import { chatApi } from '../../api/chat';
import { plurale } from '../../shared/formato';
import { SEZIONE_PARTENZE, type TabPartenze } from '../screens/partenze/tipi';
import { COSA_DA_FARE, palliniPartenze, type VocePallino } from '../screens/partenze/statiPartenze';

export type SezioneGestionale =
  | 'statistiche' | 'eventi' | 'bundle' | 'tour' | 'vetrina' | 'calendario' | 'cestino'
  | 'partenze-orari' | 'partenze-preventivi' | 'partenze-prezzi' | 'partenze-da-confermare' | 'partenze-confermato' | 'partenze-passate'
  | 'transazioni' | 'pagamenti' | 'coupon' | 'voucher' | 'campagne' | 'lista-attesa' | 'offerte' | 'rimborsi' | 'variazioni'
  | 'utenti' | 'promoter' | 'organizzatori' | 'white-label' | 'tourleader'
  | 'fornitori' | 'fermate' | 'tragitti'
  | 'chat' | 'contenuti' | 'comunicazioni'
  | 'amministratori' | 'ruoli' | 'impostazioni' | 'tracciamento' | 'template-email' | 'layout-biglietto' | 'testi-tooltip'
  | 'beta-tragitti-vicini'
  // "linee" non compare in nessun GRUPPI qui sotto: non è una voce di
  // menu, si raggiunge solo dal pulsante "Gestisci Linee" dentro un
  // tragitto in Partenze — una vera pagina a sé (indirizzo proprio:
  // ?sezione=linee&evento=...&tragitto=...), non più un modale.
  | 'linee';

// Ogni voce dichiara il permesso che serve per vederla. Chi ha ruolo
// "owner" vede sempre tutto (haPermesso lo gestisce automaticamente).
const GRUPPI: { titolo: string; voci: { id: SezioneGestionale; label: string; permesso: string }[] }[] = [
  { titolo: 'Eventi', voci: [
    { id: 'eventi', label: 'Eventi', permesso: 'eventi.visualizza' },
    { id: 'bundle', label: 'Bundle', permesso: 'bundle.visualizza' },
    { id: 'tour', label: 'Tour', permesso: 'tour.visualizza' },
    { id: 'calendario', label: 'Calendario', permesso: 'eventi.calendario' },
  ]},
  { titolo: 'Partenze', voci: [
    { id: 'partenze-orari', label: 'Orari', permesso: 'eventi.partenze' },
    { id: 'partenze-preventivi', label: 'Preventivi', permesso: 'eventi.partenze' },
    { id: 'partenze-prezzi', label: 'Prezzi', permesso: 'eventi.partenze' },
    { id: 'partenze-da-confermare', label: 'Da confermare', permesso: 'eventi.partenze' },
    { id: 'partenze-confermato', label: 'Confermate', permesso: 'eventi.partenze' },
    { id: 'partenze-passate', label: 'Passate', permesso: 'eventi.partenze' },
    { id: 'variazioni', label: 'Variazioni', permesso: 'prenotazioni.pagamenti' },
  ]},
  { titolo: 'Vendite', voci: [
    { id: 'transazioni', label: 'Prenotazioni', permesso: 'prenotazioni.transazioni' },
    { id: 'lista-attesa', label: "Lista d'attesa", permesso: 'eventi.partenze' },
  ]},
  { titolo: 'Marketing', voci: [
    { id: 'campagne', label: 'Campagne', permesso: 'campagne.gestisci' },
    { id: 'tracciamento', label: 'Tracciamento', permesso: 'impostazioni.gestisci' },
    { id: 'coupon', label: 'Coupon', permesso: 'coupon.visualizza' },
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
    { id: 'voucher', label: 'Voucher', permesso: 'coupon.visualizza' },
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
    { id: 'tragitti', label: 'Tragitti salvati', permesso: 'tragitti.visualizza' },
  ]},
  { titolo: 'Sistema', voci: [
    { id: 'amministratori', label: 'Amministratori', permesso: 'utenze.gestisci' },
    { id: 'ruoli', label: 'Ruoli', permesso: 'permessi.gestisci' },
    { id: 'cestino', label: 'Cestino', permesso: 'eventi.cestino' },
    { id: 'statistiche', label: 'Statistiche', permesso: 'statistiche.visualizza' },
    { id: 'testi-tooltip', label: 'Testi tooltip', permesso: 'impostazioni.gestisci' },
    { id: 'impostazioni', label: 'Impostazioni', permesso: 'impostazioni.gestisci' },
  ]},
  // Sezione a parte per gli strumenti ancora in prova — SOLO lettura
  // dei dati già esistenti (eventi/tragitti/fermate), nessuna scrittura
  // e nessun collegamento dentro le schermate di Partenze: può essere
  // tolta o cambiata in qualunque momento senza toccare nient'altro.
  { titolo: 'Beta', voci: [
    { id: 'beta-tragitti-vicini', label: 'Tragitti vicini', permesso: 'eventi.partenze' },
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
  // Un solo pulsante "☰ Menu" (solo mobile) invece della fila di
  // gruppi affiancati in orizzontale — dopo diversi tentativi falliti
  // di far funzionare in modo affidabile lo scorrimento orizzontale su
  // iPhone/Safari (larghezze che collassavano, pannelli che finivano
  // sotto al contenuto), un elenco verticale semplice — nessuno
  // scorrimento laterale, nessun calcolo di larghezza — è molto più
  // robusto: o funziona la disposizione verticale normale, o non
  // funziona nulla del layout mobile in generale.
  const [menuMobileAperto, setMenuMobileAperto] = useState(false);
  // Pallini di Partenze: calcolati con le stesse regole delle card e della
  // pagina del tragitto (statiPartenze.ts). Per ogni voce gli eventi con
  // almeno un tragitto rosso; in viola, a parte, quelli con il percorso
  // cambiato dopo il preventivo (su Preventivi).
  const [palliniPartenzeVoci, setPalliniPartenzeVoci] = useState<ReturnType<typeof palliniPartenze> | null>(null);
  const [inAttesa, setInAttesa] = useState(0);
  const [rimborsiInAttesa, setRimborsiInAttesa] = useState(0);
  const [fornitoriInAttesa, setFornitoriInAttesa] = useState(0);

  // "Passate" non ha pallino: è solo archivio.
  // Ogni gruppo di pallini dipende dal suo permesso (partenze, pagamenti,
  // fornitori, chat): un amministratore può avere l'uno senza l'altro.
  const [chatNonLette, setChatNonLette] = useState(0);
  const [aggiornamento, setAggiornamento] = useState(0);
  useEffect(() => {
    if (haPermesso(sessione, 'eventi.partenze')) {
      eventiApi.elencoPartenze({ soloInProgramma: true }).then((p) => setPalliniPartenzeVoci(palliniPartenze(p))).catch(() => {});
      listaAttesaApi.contaInAttesa().then((r) => setInAttesa(r.conteggio)).catch(() => {});
    }
    if (haPermesso(sessione, 'prenotazioni.pagamenti')) {
      richiesteRimborsoApi.contaInAttesa().then((r) => setRimborsiInAttesa(r.conteggio)).catch(() => {});
    }
    if (haPermesso(sessione, 'fornitori.visualizza')) {
      fornitoriApi.contaInAttesa().then((r) => setFornitoriInAttesa(r.conteggio)).catch(() => {});
    }
    if (haPermesso(sessione, 'chat.visualizza')) {
      chatApi.contaNonLette().then((r) => setChatNonLette(r.conteggio)).catch(() => {});
    }
    // Si aggiornano cambiando sezione e ogni minuto: prima restavano quelli
    // dell'accesso finché non si ricaricava la pagina.
  }, [sessione, sezioneAttiva, aggiornamento]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setAggiornamento((n) => n + 1); }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Funzione condivisa: quante notifiche ha una singola voce — usata
  // sia per il badge sulla voce stessa sia per calcolare il totale da
  // mostrare sull'intestazione del gruppo (che deve restare visibile
  // anche quando il gruppo è chiuso a tendina su mobile — altrimenti
  // una notifica dentro un gruppo chiuso passerebbe inosservata).
  /** Le notifiche viola (più urgenti) di una voce: per ora i tragitti con il
   *  percorso cambiato dopo il preventivo accettato, su "Preventivi". */
  function notificaUrgenteVoce(id: string): number {
    return id === 'partenze-preventivi' ? palliniPartenzeVoci?.percorsiCambiati ?? 0 : 0;
  }
  /** La voce di Partenze di una sezione del menu, se lo è (e ha un pallino). */
  function vocePartenze(id: string): VocePallino | null {
    const voce = (Object.keys(SEZIONE_PARTENZE) as TabPartenze[]).find((tab) => SEZIONE_PARTENZE[tab] === id);
    return voce && voce !== 'passate' ? voce : null;
  }
  function notificaVoce(id: string): number {
    const voce = vocePartenze(id);
    if (voce) return palliniPartenzeVoci?.perVoce[voce] ?? 0;
    if (id === 'lista-attesa') return inAttesa;
    if (id === 'rimborsi') return rimborsiInAttesa;
    if (id === 'chat') return chatNonLette;
    if (id === 'fornitori') return fornitoriInAttesa;
    return 0;
  }

  // Il menu a tendina (solo mobile) è un pannello a SCHERMO INTERO
  // (position:fixed, inset:0 — niente calcoli, niente misure via JS di
  // nessun tipo). In precedenza si provava a posizionarlo con
  // precisione appena sotto l'intestazione, misurandone l'altezza reale
  // via JavaScript — ma su alcuni iPhone/Safari quel calcolo risultava
  // in un pannello invisibile pur esistendo nel DOM (probabile
  // interazione tra viewport dinamico di Safari iOS e la misura JS,
  // mai riprodotta qui per verificarlo di persona). Schermo intero
  // elimina il problema alla radice: non c'è più nessun valore da
  // calcolare che possa risultare sbagliato.

  // Filtro sia i gruppi che le voci in base a ciò che l'utente loggato
  // può vedere: un gruppo compare solo se ha almeno una voce visibile.
  const gruppiVisibili = GRUPPI
    .map((gruppo) => ({ ...gruppo, voci: gruppo.voci.filter((v) => haPermesso(sessione, v.permesso)) }))
    .filter((gruppo) => gruppo.voci.length > 0);

  return (
    <div id="app" className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-riga-alto">
          <div className="logo sidebar-logo" title="Torna alla Home" onClick={onVaiHome}>
            <LogoOnWay come="testo" variante="bianca" /> <small>gestionale</small>
          </div>
          {/* Solo mobile (il CSS lo nasconde su desktop) — apre il
              pannello a schermo intero con tutti i gruppi in elenco
              verticale. */}
          <button
            type="button" className="side-hamburger" aria-label="Apri il menu"
            onClick={() => setMenuMobileAperto(true)}
          >
            ☰
          </button>
          <div className="side-utente-riga">
            <span className="side-utente-nome" title={sessione.email}>{sessione.nome}</span>
            <button className="btn btn-ghost side-logout" onClick={onLogout}>Esci</button>
          </div>
        </div>
        <nav className={`side-nav${menuMobileAperto ? ' side-nav-mobile-aperto' : ''}`}>
          {/* Intestazione visibile SOLO dentro il pannello a schermo
              intero su mobile (il CSS la nasconde altrove) — serve un
              modo esplicito per richiudere, non c'è più "tocca fuori"
              dato che il pannello copre tutto. */}
          <div className="side-nav-intestazione-mobile">
            <span>Menu</span>
            <button type="button" className="side-group-chiudi" aria-label="Chiudi il menu" onClick={() => setMenuMobileAperto(false)}>✕</button>
          </div>
          {gruppiVisibili.map((gruppo) => (
            <div className={`side-group${gruppiCollassati[gruppo.titolo] ? ' collassato' : ''}`} key={gruppo.titolo}>
              <button
                className="side-group-header"
                type="button"
                onClick={() => setGruppiCollassati((g) => ({ ...g, [gruppo.titolo]: !g[gruppo.titolo] }))}
              >
                {gruppo.titolo}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => {
                    // Solo quando il gruppo è chiuso — se è aperto, le
                    // notifiche compaiono già sulle singole voci qui
                    // sotto, mostrare anche il totale qui sarebbe
                    // ridondante.
                    if (!gruppiCollassati[gruppo.titolo]) return null;
                    const totaleGruppo = gruppo.voci.reduce((tot, v) => tot + notificaVoce(v.id), 0);
                    const urgentiGruppo = gruppo.voci.reduce((tot, v) => tot + notificaUrgenteVoce(v.id), 0);
                    return (
                      <>
                        {urgentiGruppo > 0 && <span className="side-badge side-badge-gruppo urgente">{urgentiGruppo}</span>}
                        {totaleGruppo > 0 && <span className="side-badge side-badge-gruppo">{totaleGruppo}</span>}
                      </>
                    );
                  })()}
                  <span className="group-caret">▾</span>
                </span>
              </button>
              <div className="side-group-items">
                {gruppo.voci.map((voce) => (
                  <button
                    key={voce.id}
                    className={`side-btn${sezioneAttiva === voce.id ? ' active' : ''}`}
                    onClick={() => {
                      onCambiaSezione(voce.id);
                      setMenuMobileAperto(false);
                    }}
                  >
                    {voce.label}
                    {notificaUrgenteVoce(voce.id) > 0 && (
                      <span className="side-badge urgente" title={`${plurale(notificaUrgenteVoce(voce.id), 'evento', 'eventi')} con il percorso cambiato: il preventivo va rifatto`}>
                        {notificaUrgenteVoce(voce.id)}
                      </span>
                    )}
                    {notificaVoce(voce.id) > 0 && (
                      <span
                        className="side-badge"
                        title={
                          vocePartenze(voce.id) ? `${plurale(notificaVoce(voce.id), 'evento', 'eventi')} con ${COSA_DA_FARE[vocePartenze(voce.id)!]}`
                            : voce.id === 'lista-attesa' ? `${plurale(inAttesa, 'iscrizione', 'iscrizioni')} in attesa di promozione`
                            : voce.id === 'rimborsi' ? `${plurale(rimborsiInAttesa, 'richiesta', 'richieste')} di rimborso da gestire`
                            : voce.id === 'chat' ? `${plurale(chatNonLette, 'conversazione', 'conversazioni')} con messaggi non letti`
                            : voce.id === 'fornitori' ? `${plurale(fornitoriInAttesa, 'fornitore', 'fornitori')} in attesa di approvazione`
                            : undefined
                        }
                      >
                        {notificaVoce(voce.id)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-wrap">
        <main>{children}</main>
      </div>
    </div>
  );
}
