import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/promoter.css';
import { promoterApi, type Promoter } from '../api/promoter';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';

const CHIAVE_TOKEN = 'inbus_promoter_token';

function fmtDataBreve(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PromoterPage() {
  const [loggato, setLoggato] = useState(() => !!localStorage.getItem(CHIAVE_TOKEN));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');

  async function accedi() {
    setErrore('');
    try {
      const { token } = await promoterApi.login(email, password);
      localStorage.setItem(CHIAVE_TOKEN, token);
      setLoggato(true);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Impossibile contattare il server');
    }
  }
  function esci() {
    localStorage.removeItem(CHIAVE_TOKEN);
    setLoggato(false);
  }

  return (
    <div className="pagina-partner">
      <header>
        <div className="logo">IN<span>BUS</span><small>promoter</small></div>
        <Link className="back-link" to="/">← Torna al sito</Link>
        <button className={`btn btn-ghost${!loggato ? ' hidden' : ''}`} onClick={esci}>Esci</button>
      </header>

      <main>
        <h1 className="page-title">Area Promoter</h1>
        <p className="page-sub">Accedi per generare i link dei tuoi eventi e vedere le vendite generate.</p>

        {!loggato && (
          <div className="login-box">
            <p>Inserisci email e password che ti ha fornito lo staff OoneWay.</p>
            <input type="email" placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="text" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && accedi()} />
            <button className="btn btn-primary" onClick={accedi}>Accedi</button>
            <p className="errore">{errore}</p>
            <p style={{ marginTop: 10 }}><Link to="/promoter/password-dimenticata" style={{ fontSize: 12.5 }}>Password dimenticata?</Link></p>
          </div>
        )}

        {loggato && <AreaPromoter onErroreSessione={esci} />}
      </main>
    </div>
  );
}

function AreaPromoter({ onErroreSessione }: { onErroreSessione: () => void }) {
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [stats, setStats] = useState<{ numeroPrenotazioni: number; fatturato: number } | null>(null);
  const [statsPerEvento, setStatsPerEvento] = useState<Record<string, { numeroPrenotazioni: number; fatturato: number }>>({});
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoRevenue, setEventoRevenue] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    promoterApi.me().then(setPromoter).catch(onErroreSessione);
    promoterApi.meStatistiche().then(setStats);
    promoterApi.meStatistichePerEvento().then(setStatsPerEvento);
    eventiApi.list().then(setEventi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copiaLink(link: string) {
    navigator.clipboard.writeText(link).then(() => mostraToast('Link copiato'));
  }
  function mostraToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  if (!promoter || !stats) return <p style={{ color: 'var(--mist)' }}>Carico...</p>;

  const percentuale = Number(promoter.commissionePercentuale);
  const commissione = stats.fatturato * (percentuale / 100);
  const eventiOrdinati = eventi.slice().sort((a, b) => a.data.localeCompare(b.data));

  const statoEventoRevenue = eventoRevenue ? statsPerEvento[eventoRevenue] : null;

  return (
    <>
      <div className="stats-row">
        <div className="stat-box"><b>{stats.numeroPrenotazioni}</b><span>Vendite generate</span></div>
        <div className="stat-box"><b>€{stats.fatturato.toFixed(2)}</b><span>Fatturato generato</span></div>
        <div className="stat-box"><b>€{commissione.toFixed(2)}</b><span>Commissione maturata ({promoter.commissionePercentuale}%)</span></div>
      </div>

      <h2 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, margin: '24px 0 14px' }}>Revenue per evento</h2>
      <div className="mini-tabs" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        {eventiOrdinati.filter((ev) => statsPerEvento[ev.id]).map((ev) => (
          <button key={ev.id} type="button" className={`mini-tab${eventoRevenue === ev.id ? ' active' : ''}`} onClick={() => setEventoRevenue(ev.id)}>
            {ev.artista}
          </button>
        ))}
        {!eventiOrdinati.some((ev) => statsPerEvento[ev.id]) && (
          <p style={{ color: 'var(--mist)', fontSize: 13 }}>Nessuna vendita ancora — appena arriva la prima, comparirà qui divisa per evento.</p>
        )}
      </div>
      {statoEventoRevenue && (
        <div className="stats-row" style={{ marginBottom: 24 }}>
          <div className="stat-box"><b>{statoEventoRevenue.numeroPrenotazioni}</b><span>Vendite su questo evento</span></div>
          <div className="stat-box"><b>€{statoEventoRevenue.fatturato.toFixed(2)}</b><span>Fatturato su questo evento</span></div>
          <div className="stat-box"><b>€{(statoEventoRevenue.fatturato * percentuale / 100).toFixed(2)}</b><span>Tua commissione su questo evento</span></div>
        </div>
      )}

      <h2 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, margin: '24px 0 14px' }}>I tuoi link</h2>
      <p style={{ color: 'var(--mist)', fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Un link per ogni evento — copialo e condividilo dove vuoi. Decidi tu quali pubblicizzare.
      </p>

      {!eventiOrdinati.length && (
        <div className="empty-box">Non ci sono eventi ancora.</div>
      )}

      {eventiOrdinati.map((ev) => {
        const link = `${window.location.origin}/?promo=${promoter.codice}&evento=${ev.id}`;
        return (
          <div className="evento-link-card" key={ev.id}>
            <div>
              <h3>{ev.artista}</h3>
              <p>{ev.luogo}, {ev.citta} · {fmtDataBreve(ev.data)}</p>
            </div>
            <div className="link-azione">
              <input type="text" readOnly value={link} />
              <button className="btn btn-ghost" onClick={() => copiaLink(link)}>Copia link</button>
            </div>
          </div>
        );
      })}

      <div className="toast" style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', background: 'var(--paper)', color: 'var(--ink)', padding: '12px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, opacity: toast ? 1 : 0, pointerEvents: 'none', transition: 'opacity .25s ease', zIndex: 999 }}>
        {toast}
      </div>
      <CookieBanner />
    </>
  );
}
