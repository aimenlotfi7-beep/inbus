import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/promoter.css';
import { promoterApi, type Promoter } from '../api/promoter';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { ErroreApi } from '../api/client';

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
    <>
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
            <p>Inserisci email e password che ti ha fornito lo staff INBUS.</p>
            <input type="email" placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="text" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && accedi()} />
            <button className="btn btn-primary" onClick={accedi}>Accedi</button>
            <p className="errore">{errore}</p>
          </div>
        )}

        {loggato && <AreaPromoter onErroreSessione={esci} />}
      </main>
    </>
  );
}

function AreaPromoter({ onErroreSessione }: { onErroreSessione: () => void }) {
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [stats, setStats] = useState<{ numeroPrenotazioni: number; fatturato: number } | null>(null);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    promoterApi.me().then(setPromoter).catch(onErroreSessione);
    promoterApi.meStatistiche().then(setStats);
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

  const commissione = stats.fatturato * (Number(promoter.commissionePercentuale) / 100);
  const eventiAbilitati = eventi
    .filter((e) => promoter.eventiAbilitati.includes(e.id))
    .sort((a, b) => a.data.localeCompare(b.data));

  return (
    <>
      <div className="stats-row">
        <div className="stat-box"><b>{stats.numeroPrenotazioni}</b><span>Vendite generate</span></div>
        <div className="stat-box"><b>€{stats.fatturato.toFixed(2)}</b><span>Fatturato generato</span></div>
        <div className="stat-box"><b>€{commissione.toFixed(2)}</b><span>Commissione maturata ({promoter.commissionePercentuale}%)</span></div>
      </div>

      <h2 style={{ fontFamily: "'Anton',sans-serif", textTransform: 'uppercase', fontSize: 18, margin: '0 0 14px' }}>I tuoi eventi</h2>

      {!eventiAbilitati.length && (
        <div className="empty-box">Non sei ancora abilitato a vendere nessun evento. Contatta lo staff INBUS per farti aggiungere.</div>
      )}

      {eventiAbilitati.map((ev) => {
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
    </>
  );
}
