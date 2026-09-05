import { useEffect, useState } from 'react';
import { LogoOnWay } from '../features/LogoOnWay';
import { Link } from 'react-router-dom';
import '../styles/promoter.css';
import { organizzatoriApi, type Organizzatore, type EventoAssegnato, type StatisticheGenerali, type StatisticaEvento } from '../api/organizzatori';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';

const CHIAVE_TOKEN = 'inbus_organizzatore_token';

function fmtDataBreve(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function OrganizzatorePage() {
  const [loggato, setLoggato] = useState(() => !!localStorage.getItem(CHIAVE_TOKEN));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');

  async function accedi() {
    setErrore('');
    try {
      const { token } = await organizzatoriApi.login(email, password);
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
        <div className="logo"><LogoOnWay come="testo" /><small>organizzatore</small></div>
        <Link className="back-link" to="/">← Torna al sito</Link>
        <button className={`btn btn-ghost${!loggato ? ' hidden' : ''}`} onClick={esci}>Esci</button>
      </header>

      <main>
        <h1 className="page-title">Area Organizzatore</h1>
        <p className="page-sub">Accedi per vedere gli eventi che OnWay ti ha associato.</p>

        {!loggato && (
          <div className="login-box">
            <p>Inserisci email e password che ti ha fornito lo staff OnWay.</p>
            <input type="email" placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && accedi()} />
            <button className="btn btn-primary" onClick={accedi}>Accedi</button>
            <p className="errore">{errore}</p>
            <p style={{ marginTop: 10 }}><Link to="/organizzatore/password-dimenticata" style={{ fontSize: 12.5 }}>Password dimenticata?</Link></p>
          </div>
        )}

        {loggato && <AreaOrganizzatore onErroreSessione={esci} />}
      </main>
      <CookieBanner />
    </div>
  );
}

function AreaOrganizzatore({ onErroreSessione }: { onErroreSessione: () => void }) {
  const [organizzatore, setOrganizzatore] = useState<Organizzatore | null>(null);
  const [eventi, setEventi] = useState<EventoAssegnato[] | null>(null);
  const [generali, setGenerali] = useState<StatisticheGenerali | null>(null);
  const [perEvento, setPerEvento] = useState<StatisticaEvento[] | null>(null);

  useEffect(() => {
    organizzatoriApi.me().then(setOrganizzatore).catch(onErroreSessione);
    organizzatoriApi.meEventi().then(setEventi);
    organizzatoriApi.meStatistiche().then(setGenerali);
    organizzatoriApi.meStatistichePerEvento().then(setPerEvento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!organizzatore || !eventi) return <p style={{ color: 'var(--mist)' }}>Carico...</p>;

  const eventiOrdinati = eventi.slice().sort((a, b) => a.data.localeCompare(b.data));

  function statoPerEvento(eventoId: string) {
    return perEvento?.find((s) => s.eventoId === eventoId) ?? null;
  }

  return (
    <>
      {generali && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 22 }}>
          <div className="stat-box"><b>{generali.eventiAttivi}</b><span>Eventi attivi</span></div>
          <div className="stat-box"><b>{generali.viaggiatori}</b><span>Viaggiatori</span></div>
          <div className="stat-box"><b>€{generali.fatturato.toFixed(2)}</b><span>Fatturato</span></div>
          <div className="stat-box"><b>€{generali.quotaOrganizzatore.toFixed(2)}</b><span>Tua quota</span></div>
        </div>
      )}

      <h2 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, margin: '4px 0 14px' }}>I tuoi eventi</h2>

      {!eventiOrdinati.length && (
        <div className="empty-box">Non hai ancora nessun evento associato — contatta OnWay per farti assegnare i tuoi eventi.</div>
      )}

      {eventiOrdinati.map((ev) => {
        const s = statoPerEvento(ev.id);
        return (
          <div className="evento-link-card" key={ev.id}>
            <div>
              <h3>{ev.artista}</h3>
              <p>{ev.luogo}, {ev.citta} · {fmtDataBreve(ev.data)}</p>
              {s && (
                <p style={{ fontSize: 12.5, color: 'var(--mist)', marginTop: 4 }}>
                  {s.viaggiatori} viaggiator{s.viaggiatori === 1 ? 'e' : 'i'} · €{s.fatturato.toFixed(2)} fatturato · tua quota €{s.quotaOrganizzatore.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </>

  );
}
