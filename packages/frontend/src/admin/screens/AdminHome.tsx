import { useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { LogoOnWay } from '../../features/LogoOnWay';
import { utentiApi } from '../../api/utenti';
import type { Evento } from '../../api/types';
import type { SezioneGestionale } from '../shared/AdminLayout';

interface Risultato { tipo: string; titolo: string; sotto: string; azione: () => void; }

export function AdminHome({ onVaiA }: { onVaiA: (s: SezioneGestionale) => void }) {
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<Risultato[] | null>(null);
  const [cercando, setCercando] = useState(false);

  async function cerca() {
    if (query.trim().length < 2) return;
    setCercando(true);
    const q = query.trim().toLowerCase();
    const [eventi, utenti] = await Promise.all([eventiApi.list(), utentiApi.list()]);

    const trovati: Risultato[] = [
      ...eventi.filter((e: Evento) => e.artista.toLowerCase().includes(q) || e.citta.toLowerCase().includes(q))
        .map((e: Evento) => ({ tipo: 'Evento', titolo: `🎤 ${e.artista}`, sotto: `${e.luogo}, ${e.citta}`, azione: () => onVaiA('eventi') })),
      ...utenti.filter((u) => (u.nome ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .map((u) => ({ tipo: 'Utente', titolo: `👤 ${u.nome ?? ''} ${u.cognome ?? ''}`, sotto: u.email, azione: () => onVaiA('utenti') })),
    ];
    setRisultati(trovati);
    setCercando(false);
  }

  return (
    <section id="tab-home" className="tab-panel">
      <div className="home-search-center">
        <div className="logo home-logo"><LogoOnWay come="testo" freccia="mono" /> <small>gestionale</small></div>
        <p className="home-search-sub">Cerca un evento o un cliente</p>
        <div className="home-search-box">
          <input
            type="text"
            placeholder="Inizia a digitare per cercare..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cerca()}
          />
        </div>
        <p className="home-search-hint">Premi Invio per cercare</p>

        {cercando && <p style={{ color: 'var(--mist)', marginTop: 20 }}>Cerco...</p>}

        {risultati && (
          <div className="home-risultati">
            {!risultati.length && <p style={{ color: 'var(--mist)', textAlign: 'center' }}>Nessun risultato per "{query}"</p>}
            {risultati.map((r, i) => (
              <div key={i} className="global-search-item" onClick={r.azione} style={{ cursor: 'pointer' }}>
                {r.titolo}<small>{r.sotto}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
