import { useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { LogoOnWay } from '../../features/LogoOnWay';
import { utentiApi } from '../../api/utenti';
import type { Evento } from '../../api/types';
import type { SezioneGestionale } from '../shared/AdminLayout';
import { cercaSezioni } from '../shared/ricercaSezioni';
import { puoVedereSezione } from '../shared/permessiSezioni';
import { useSessione } from '../shared/SessioneContext';
import { formattaData } from '../../shared/formato';

interface Risultato { tipo: string; titolo: string; sotto: string; azione: () => void; }

export function AdminHome({ onVaiA }: { onVaiA: (s: SezioneGestionale, parametriExtra?: Record<string, string | null>) => void }) {
  const sessione = useSessione();
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<Risultato[] | null>(null);
  const [cercando, setCercando] = useState(false);

  // Le sezioni si filtrano mentre si scrive: sono già qui, non serve
  // chiedere niente al server né premere Invio (proprietario, ottobre
  // 2026: "scrivi rimb e ci sei"). Eventi e clienti restano su Invio,
  // perché vanno chiesti al server.
  const sezioni = cercaSezioni(query, (s) => puoVedereSezione(sessione, s));

  async function cerca() {
    if (query.trim().length < 2) return;
    setCercando(true);
    const q = query.trim().toLowerCase();
    const [eventi, utenti] = await Promise.all([eventiApi.list(), utentiApi.list()]);

    // Cliccando un risultato si apre QUELLO, non l'elenco della sezione:
    // prima bisognava cercarlo di nuovo a mano dentro la sezione.
    const trovati: Risultato[] = [
      ...eventi.filter((e: Evento) => e.artista.toLowerCase().includes(q) || e.citta.toLowerCase().includes(q))
        .map((e: Evento) => ({
          tipo: 'Evento',
          titolo: e.artista,
          sotto: `${e.luogo}, ${e.citta} · ${formattaData(e.data)}`,
          azione: () => onVaiA('eventi', { eventoId: e.id }),
        })),
      ...utenti.filter((u) => (u.nome ?? '').toLowerCase().includes(q) || (u.cognome ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .map((u) => ({
          tipo: 'Cliente',
          titolo: `${u.nome ?? ''} ${u.cognome ?? ''}`.trim() || u.email,
          sotto: u.email,
          azione: () => onVaiA('utenti', { utenteId: u.id }),
        })),
    ];
    setRisultati(trovati);
    setCercando(false);
  }

  function scrivi(testo: string) {
    setQuery(testo);
    // I risultati di prima non devono restare sotto una ricerca nuova.
    if (risultati) setRisultati(null);
  }

  return (
    <section id="tab-home" className="tab-panel">
      <div className="home-search-center">
        <div className="logo home-logo"><LogoOnWay come="testo" variante="nera" /> <small>gestionale</small></div>
        <p className="home-search-sub">Cerca una sezione, un evento o un cliente</p>
        <div className="home-search-box">
          <input
            type="text"
            placeholder="Inizia a digitare per cercare…"
            value={query}
            onChange={(e) => scrivi(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cerca()}
          />
        </div>
        <p className="home-search-hint">
          {sezioni.length > 0 ? 'Premi Invio per cercare anche tra eventi e clienti' : 'Premi Invio per cercare'}
        </p>

        {sezioni.length > 0 && (
          <div className="home-risultati">
            {sezioni.map((s) => (
              <div key={s.id} className="global-search-item" onClick={() => onVaiA(s.id)} style={{ cursor: 'pointer' }}>
                {s.label}<small>Sezione · {s.gruppo}</small>
              </div>
            ))}
          </div>
        )}

        {cercando && <p style={{ color: 'var(--mist)', marginTop: 20 }}>Cerco…</p>}

        {risultati && (
          <div className="home-risultati">
            {!risultati.length && !sezioni.length && <p style={{ color: 'var(--mist)', textAlign: 'center' }}>Nessun risultato per "{query}"</p>}
            {risultati.map((r, i) => (
              <div key={i} className="global-search-item" onClick={r.azione} style={{ cursor: 'pointer' }}>
                {r.titolo}<small>{r.tipo} · {r.sotto}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
