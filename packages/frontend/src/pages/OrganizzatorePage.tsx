import { useEffect, useState } from 'react';
import { LogoOnWay } from '../features/LogoOnWay';
import { Link } from 'react-router-dom';
import { AccountShell, type VoceMenuAccount } from '../features/AccountShell';
import '../styles/promoter.css';
import { organizzatoriApi, type Organizzatore, type EventoAssegnato, type StatisticheGenerali, type StatisticaEvento, type StatisticaBundle } from '../api/organizzatori';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';
import { formattaEuro } from '../shared/formato';

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

  if (loggato) return <AreaOrganizzatore onErroreSessione={esci} />;

  return (
    <div className="pagina-partner">
      <header>
        <div className="logo"><LogoOnWay come="testo" /><small>organizzatore</small></div>
        <Link className="back-link" to="/">← Torna al sito</Link>
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
            <p style={{ marginTop: 10 }}><Link to="/organizzatore/password-dimenticata" style={{ fontSize: 'var(--testo-md)' }}>Password dimenticata?</Link></p>
          </div>
        )}
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
  const [perBundle, setPerBundle] = useState<StatisticaBundle[]>([]);
  const [voce, setVoce] = useState<'panoramica' | 'eventi' | 'bundle'>('panoramica');

  useEffect(() => {
    organizzatoriApi.me().then(setOrganizzatore).catch(onErroreSessione);
    organizzatoriApi.meEventi().then(setEventi);
    organizzatoriApi.meStatistiche().then(setGenerali);
    organizzatoriApi.meStatistichePerEvento().then(setPerEvento);
    organizzatoriApi.meStatistichePerBundle().then(setPerBundle).catch(() => setPerBundle([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function esci() {
    localStorage.removeItem(CHIAVE_TOKEN);
    onErroreSessione();
  }

  if (!organizzatore || !eventi) return <p style={{ color: 'var(--mist)' }}>Carico...</p>;

  const eventiOrdinati = eventi.slice().sort((a, b) => a.data.localeCompare(b.data));

  function statoPerEvento(eventoId: string) {
    return perEvento?.find((s) => s.eventoId === eventoId) ?? null;
  }

  const voci: VoceMenuAccount[] = [{ id: 'panoramica', label: 'Panoramica' }, { id: 'eventi', label: 'I tuoi eventi' }];
  if (perBundle.length > 0) voci.push({ id: 'bundle', label: 'I tuoi bundle' });

  return (
    <AccountShell
      etichettaTipo="organizzatore" nomeUtente={organizzatore.nome} onLogout={esci} temaChiaro
      voci={voci} voceAttiva={voce} onCambiaVoce={(v) => setVoce(v as typeof voce)}
    >
      {voce === 'panoramica' && (
        <>
          <h1 className="page-title" style={{ marginBottom: 20 }}>Panoramica</h1>
          {generali && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 22 }}>
              <div className="stat-box"><b>{generali.eventiAttivi}</b><span>Eventi attivi</span></div>
              <div className="stat-box"><b>{generali.viaggiatori}</b><span>Viaggiatori</span></div>
              <div className="stat-box"><b>{formattaEuro(generali.fatturato)}</b><span>Fatturato</span></div>
              <div className="stat-box"><b>{formattaEuro(generali.quotaOrganizzatore)}</b><span>Tua quota</span></div>
            </div>
          )}
          {!eventiOrdinati.length && (
            <div className="empty-box">Non hai ancora nessun evento associato — contatta OnWay per farti assegnare i tuoi eventi.</div>
          )}
        </>
      )}

      {voce === 'eventi' && (
        <>
          <h1 className="page-title" style={{ marginBottom: 20 }}>I tuoi eventi</h1>
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
                    <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginTop: 4 }}>
                      {s.viaggiatori} viaggiator{s.viaggiatori === 1 ? 'e' : 'i'} · {formattaEuro(s.fatturato)} fatturato · tua quota {formattaEuro(s.quotaOrganizzatore)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {voce === 'bundle' && perBundle.length > 0 && (
        <>
          <h1 className="page-title" style={{ marginBottom: 6 }}>I tuoi bundle</h1>
          <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)', marginBottom: 20 }}>
            Gli stessi acquisti contano anche sotto ogni evento — questa è una vista in più, non una somma a parte.
          </p>
          {perBundle.map((b) => (
            <div className="evento-link-card" key={b.bundleId}>
              <div>
                <h3>{b.bundleNome} <span style={{ fontSize: 'var(--testo-sm)', opacity: .7, fontWeight: 400 }}>bundle</span></h3>
                <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginTop: 4 }}>
                  {b.numeroOrdini} ordin{b.numeroOrdini === 1 ? 'e' : 'i'} · {b.viaggiatori} viaggiator{b.viaggiatori === 1 ? 'e' : 'i'} · {formattaEuro(b.fatturato)} fatturato (sconto applicato {formattaEuro(b.scontoApplicato)}) · tua quota {formattaEuro(b.quotaOrganizzatore)}
                </p>
              </div>
            </div>
          ))}
        </>
      )}

      <CookieBanner />
    </AccountShell>
  );
}
