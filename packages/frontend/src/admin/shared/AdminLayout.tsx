import { useState, type ReactNode } from 'react';

export type SezioneGestionale =
  | 'statistiche' | 'eventi' | 'vetrina' | 'calendario' | 'cestino'
  | 'transazioni' | 'pagamenti' | 'coupon'
  | 'utenti' | 'promoter' | 'tourleader'
  | 'fornitori' | 'tragitti'
  | 'chat' | 'contenuti'
  | 'amministratori';

const GRUPPI: { titolo: string; voci: { id: SezioneGestionale; label: string }[] }[] = [
  { titolo: 'Eventi', voci: [
    { id: 'eventi', label: 'Eventi' },
    { id: 'vetrina', label: 'Vetrina' },
  ]},
  { titolo: 'Vendite', voci: [
    { id: 'coupon', label: 'Coupon' },
  ]},
  { titolo: 'Persone', voci: [
    { id: 'utenti', label: 'Utenti' },
    { id: 'promoter', label: 'Promoter' },
    { id: 'tourleader', label: 'Tour Leader' },
  ]},
  { titolo: 'Logistica', voci: [
    { id: 'fornitori', label: 'Fornitori' },
    { id: 'tragitti', label: 'Tragitti' },
  ]},
  { titolo: 'Comunicazione', voci: [
    { id: 'chat', label: 'Chat' },
    { id: 'contenuti', label: 'Contenuti sito' },
  ]},
  { titolo: 'Sistema', voci: [
    { id: 'amministratori', label: 'Amministratori' },
    { id: 'statistiche', label: 'Statistiche' },
  ]},
];

export function AdminLayout({
  sezioneAttiva, onCambiaSezione, onVaiHome, onLogout, children,
}: {
  sezioneAttiva: SezioneGestionale | 'home';
  onCambiaSezione: (s: SezioneGestionale) => void;
  onVaiHome: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [gruppiCollassati, setGruppiCollassati] = useState<Record<string, boolean>>({});

  return (
    <div id="app" className="app-shell">
      <aside className="sidebar">
        <div className="logo sidebar-logo" title="Torna alla Home" onClick={onVaiHome}>
          IN<span>BUS</span> <small>gestionale</small>
        </div>
        <nav className="side-nav">
          {GRUPPI.map((gruppo) => (
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
