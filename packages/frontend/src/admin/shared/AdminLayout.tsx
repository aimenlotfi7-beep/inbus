import { useEffect, useState, type ReactNode } from 'react';
import { haPermesso, type SessioneAdmin } from '../../api/auth';
import { eventiApi } from '../../api/eventi';
import { listaAttesaApi } from '../../api/listaAttesa';
import { richiesteRimborsoApi } from '../../api/richiesteRimborso';
import { chatApi } from '../../api/chat';

export type SezioneGestionale =
  | 'statistiche' | 'eventi' | 'vetrina' | 'calendario' | 'cestino'
  | 'partenze-orari' | 'partenze-prezzi' | 'partenze-da-confermare' | 'partenze-confermato' | 'partenze-passate'
  | 'transazioni' | 'pagamenti' | 'coupon' | 'campagne' | 'lista-attesa' | 'offerte' | 'rimborsi' | 'variazioni'
  | 'utenti' | 'promoter' | 'organizzatori' | 'white-label' | 'tourleader'
  | 'fornitori' | 'fermate' | 'tragitti'
  | 'chat' | 'contenuti' | 'comunicazioni'
  | 'amministratori' | 'ruoli' | 'impostazioni' | 'template-email' | 'layout-biglietto' | 'testi-tooltip'
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
    { id: 'calendario', label: 'Calendario', permesso: 'eventi.calendario' },
  ]},
  { titolo: 'Partenze', voci: [
    { id: 'partenze-orari', label: 'Orari', permesso: 'eventi.partenze' },
    { id: 'partenze-prezzi', label: 'Prezzi', permesso: 'eventi.partenze' },
    { id: 'partenze-da-confermare', label: 'Da Confermare', permesso: 'eventi.partenze' },
    { id: 'partenze-confermato', label: 'Confermato', permesso: 'eventi.partenze' },
    { id: 'partenze-passate', label: 'Passate', permesso: 'eventi.partenze' },
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
  const [allertePartenze, setAllertePartenze] = useState(0);
  const [eventiDaCalcolareOrari, setEventiDaCalcolareOrari] = useState(0);
  const [eventiDaPrezzare, setEventiDaPrezzare] = useState(0);
  const [eventiDaCostruireLinee, setEventiDaCostruireLinee] = useState(0);
  const [inAttesa, setInAttesa] = useState(0);
  const [rimborsiInAttesa, setRimborsiInAttesa] = useState(0);

  // Notifiche su ogni tappa di Partenze dove c'è davvero qualcosa da
  // lavorare — "Orari" quanti eventi non hanno ancora nessun orario
  // impostato, "Prezzi" quanti non sono ancora prezzati, "Da
  // Confermare" quanti sono prezzati ma senza ancora una Linea,
  // "Confermato" le tratte con più passeggeri confermati dei posti
  // previsti. "Passate" non ne ha una — è solo archivio, niente da
  // lavorare lì per definizione. Solo per chi ha il permesso di vedere
  // quella sezione.
  useEffect(() => {
    if (!haPermesso(sessione, 'eventi.partenze')) return;
    eventiApi.allertePartenze().then((r) => setAllertePartenze(r.conteggio)).catch(() => {});
    eventiApi.eventiDaCalcolareOrari().then((r) => setEventiDaCalcolareOrari(r.conteggio)).catch(() => {});
    eventiApi.eventiDaPrezzare().then((r) => setEventiDaPrezzare(r.conteggio)).catch(() => {});
    eventiApi.eventiDaCostruireLinee().then((r) => setEventiDaCostruireLinee(r.conteggio)).catch(() => {});
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

  // Funzione condivisa: quante notifiche ha una singola voce — usata
  // sia per il badge sulla voce stessa sia per calcolare il totale da
  // mostrare sull'intestazione del gruppo (che deve restare visibile
  // anche quando il gruppo è chiuso a tendina su mobile — altrimenti
  // una notifica dentro un gruppo chiuso passerebbe inosservata).
  function notificaVoce(id: string): number {
    if (id === 'partenze-orari') return eventiDaCalcolareOrari;
    if (id === 'partenze-prezzi') return eventiDaPrezzare;
    if (id === 'partenze-da-confermare') return eventiDaCostruireLinee;
    if (id === 'partenze-confermato') return allertePartenze;
    if (id === 'lista-attesa') return inAttesa;
    if (id === 'rimborsi') return rimborsiInAttesa;
    if (id === 'chat') return chatNonLette;
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
            IN<span>BUS</span> <small>gestionale</small>
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
                    return totaleGruppo > 0 ? <span className="side-badge side-badge-gruppo">{totaleGruppo}</span> : null;
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
                    {notificaVoce(voce.id) > 0 && (
                      <span
                        className="side-badge"
                        title={
                          voce.id === 'partenze-orari' ? `${eventiDaCalcolareOrari} evento/i senza ancora nessun orario impostato`
                            : voce.id === 'partenze-prezzi' ? `${eventiDaPrezzare} evento/i con almeno un tragitto non ancora prezzato`
                            : voce.id === 'partenze-da-confermare' ? `${eventiDaCostruireLinee} evento/i con almeno un tragitto prezzato ma senza ancora una Linea`
                            : voce.id === 'partenze-confermato' ? `${allertePartenze} tratta/e con posti superati`
                            : voce.id === 'lista-attesa' ? `${inAttesa} iscrizione/i in attesa di promozione`
                            : voce.id === 'rimborsi' ? `${rimborsiInAttesa} richiesta/e di rimborso da gestire`
                            : voce.id === 'chat' ? `${chatNonLette} conversazione/i con messaggi non letti`
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
