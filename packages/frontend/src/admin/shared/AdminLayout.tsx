import { useEffect, useState, type ReactNode } from 'react';
import { haPermesso, type SessioneAdmin } from '../../api/auth';
import { eventiApi } from '../../api/eventi';

export type SezioneGestionale =
  | 'statistiche' | 'eventi' | 'vetrina' | 'calendario' | 'cestino' | 'partenze'
  | 'transazioni' | 'pagamenti' | 'coupon'
  | 'utenti' | 'promoter' | 'tourleader'
  | 'fornitori' | 'tragitti'
  | 'chat' | 'contenuti'
  | 'amministratori' | 'ruoli' | 'impostazioni';

// Ogni voce dichiara il permesso che serve per vederla. Chi ha ruolo
// "owner" vede sempre tutto (haPermesso lo gestisce automaticamente).
const GRUPPI: { titolo: string; voci: { id: SezioneGestionale; label: string; permesso: string }[] }[] = [
  { titolo: 'Eventi', voci: [
    { id: 'eventi', label: 'Eventi', permesso: 'eventi.visualizza' },
    { id: 'vetrina', label: 'Vetrina', permesso: 'eventi.vetrina' },
    { id: 'calendario', label: 'Calendario', permesso: 'eventi.calendario' },
    { id: 'partenze', label: 'Partenze', permesso: 'eventi.partenze' },
    { id: 'cestino', label: 'Cestino', permesso: 'eventi.cestino' },
  ]},
  { titolo: 'Vendite', voci: [
    { id: 'coupon', label: 'Coupon', permesso: 'coupon.visualizza' },
    { id: 'transazioni', label: 'Prenotazioni', permesso: 'prenotazioni.transazioni' },
    { id: 'pagamenti', label: 'Pagamenti', permesso: 'prenotazioni.pagamenti' },
  ]},
  { titolo: 'Persone', voci: [
    { id: 'utenti', label: 'Utenti', permesso: 'utenti.visualizza' },
    { id: 'promoter', label: 'Promoter', permesso: 'promoter.visualizza' },
    { id: 'tourleader', label: 'Tour Leader', permesso: 'tourleader.visualizza' },
  ]},
  { titolo: 'Logistica', voci: [
    { id: 'fornitori', label: 'Fornitori', permesso: 'fornitori.visualizza' },
    { id: 'tragitti', label: 'Tragitti', permesso: 'tragitti.visualizza' },
  ]},
  { titolo: 'Comunicazione', voci: [
    { id: 'chat', label: 'Chat', permesso: 'chat.visualizza' },
    { id: 'contenuti', label: 'Contenuti sito', permesso: 'pagine.gestisci' },
  ]},
  { titolo: 'Sistema', voci: [
    { id: 'amministratori', label: 'Amministratori', permesso: 'utenze.gestisci' },
    { id: 'ruoli', label: 'Ruoli', permesso: 'permessi.gestisci' },
    { id: 'impostazioni', label: 'Impostazioni', permesso: 'impostazioni.gestisci' },
    { id: 'statistiche', label: 'Statistiche', permesso: 'statistiche.visualizza' },
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
  const [gruppiCollassati, setGruppiCollassati] = useState<Record<string, boolean>>({});
  const [allertePartenze, setAllertePartenze] = useState(0);

  // Notifica sulla voce "Partenze": quante tratte, in tutti gli eventi,
  // hanno più passeggeri confermati dei posti previsti. Solo per chi ha
  // il permesso di vedere quella sezione.
  useEffect(() => {
    if (!haPermesso(sessione, 'eventi.partenze')) return;
    eventiApi.allertePartenze().then((r) => setAllertePartenze(r.conteggio)).catch(() => {});
  }, [sessione]);

  // Filtro sia i gruppi che le voci in base a ciò che l'utente loggato
  // può vedere: un gruppo compare solo se ha almeno una voce visibile.
  const gruppiVisibili = GRUPPI
    .map((gruppo) => ({ ...gruppo, voci: gruppo.voci.filter((v) => haPermesso(sessione, v.permesso)) }))
    .filter((gruppo) => gruppo.voci.length > 0);

  return (
    <div id="app" className="app-shell">
      <aside className="sidebar">
        <div className="logo sidebar-logo" title="Torna alla Home" onClick={onVaiHome}>
          IN<span>BUS</span> <small>gestionale</small>
        </div>
        <nav className="side-nav">
          {gruppiVisibili.map((gruppo) => (
            <div className={`side-group${gruppiCollassati[gruppo.titolo] ? ' collassato' : ''}`} key={gruppo.titolo}>
              <button
                className="side-group-header"
                type="button"
                onClick={() => setGruppiCollassati((g) => ({ ...g, [gruppo.titolo]: !g[gruppo.titolo] }))}
              >
                {gruppo.titolo} <span className="group-caret">▾</span>
              </button>
              <div className="side-group-items">
                {gruppo.voci.map((voce) => (
                  <button
                    key={voce.id}
                    className={`side-btn${sezioneAttiva === voce.id ? ' active' : ''}`}
                    onClick={() => onCambiaSezione(voce.id)}
                  >
                    {voce.label}
                    {voce.id === 'partenze' && allertePartenze > 0 && (
                      <span className="side-badge" title={`${allertePartenze} tratta/e con posti superati`}>{allertePartenze}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button className="btn btn-ghost side-logout" onClick={onLogout}>Esci</button>
      </aside>

      <div className="main-wrap">
        <main>{children}</main>
      </div>
    </div>
  );
}
