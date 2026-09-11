import { useEffect, useState } from 'react';
import { LogoOnWay } from '../features/LogoOnWay';
import { Link } from 'react-router-dom';
import { AccountShell } from '../features/AccountShell';
import '../styles/promoter.css';
import { promoterApi, type Promoter, type CouponPromoter } from '../api/promoter';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';
import { formattaEuro } from '../shared/formato';

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

  // Una volta autenticato, AreaPromoter porta il proprio layout intero
  // (AccountShell — menu laterale, gestisce già mobile) — la vecchia
  // intestazione qui sotto vale solo PRIMA di accedere (login), dove
  // un menu non avrebbe senso (non c'è ancora nulla da navigare).
  if (loggato) return <AreaPromoter onErroreSessione={esci} />;

  return (
    <div className="pagina-partner">
      <header>
        <div className="logo"><LogoOnWay come="testo" /><small>promoter</small></div>
        <Link className="back-link" to="/">← Torna al sito</Link>
      </header>

      <main>
        <h1 className="page-title">Area Promoter</h1>
        <p className="page-sub">Accedi per generare i link dei tuoi eventi e vedere le vendite generate.</p>

        {!loggato && (
          <div className="login-box">
            <p>Inserisci email e password che ti ha fornito lo staff OnWay.</p>
            <input type="email" placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="text" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && accedi()} />
            <button className="btn btn-primary" onClick={accedi}>Accedi</button>
            <p className="errore">{errore}</p>
            <p style={{ marginTop: 10 }}><Link to="/promoter/password-dimenticata" style={{ fontSize: 12.5 }}>Password dimenticata?</Link></p>
          </div>
        )}
      </main>
    </div>
  );
}

function AreaPromoter({ onErroreSessione }: { onErroreSessione: () => void }) {
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [stats, setStats] = useState<{ numeroPrenotazioni: number; fatturato: number; commissione: number } | null>(null);
  const [statsPerEvento, setStatsPerEvento] = useState<Record<string, { numeroPrenotazioni: number; fatturato: number; commissione: number }>>({});
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoRevenue, setEventoRevenue] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [voce, setVoce] = useState<'panoramica' | 'link' | 'coupon'>('panoramica');

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

  function esci() {
    localStorage.removeItem(CHIAVE_TOKEN);
    onErroreSessione();
  }

  if (!promoter || !stats) return <p style={{ color: 'var(--mist)' }}>Carico...</p>;

  // Calcolata dal server (shared/commissionePromoter.ts): non e' piu'
  // sempre "fatturato x un'unica percentuale", un coupon puo' avere un
  // compenso proprio.
  const commissione = stats.commissione;
  const eventiOrdinati = eventi.slice().sort((a, b) => a.data.localeCompare(b.data));

  const statoEventoRevenue = eventoRevenue ? statsPerEvento[eventoRevenue] : null;

  return (
    <AccountShell
      etichettaTipo="promoter" nomeUtente={promoter.nome} onLogout={esci} temaChiaro
      voci={[
        { id: 'panoramica', label: 'Panoramica' },
        { id: 'link', label: 'I tuoi link' },
        { id: 'coupon', label: 'Codici sconto' },
      ]}
      voceAttiva={voce} onCambiaVoce={(v) => setVoce(v as typeof voce)}
    >
      {voce === 'panoramica' && (
        <>
          <h1 className="page-title" style={{ marginBottom: 20 }}>Panoramica</h1>
          <div className="stats-row">
            <div className="stat-box"><b>{stats.numeroPrenotazioni}</b><span>Vendite generate</span></div>
            <div className="stat-box"><b>{formattaEuro(stats.fatturato)}</b><span>Fatturato generato</span></div>
            <div className="stat-box"><b>{formattaEuro(commissione)}</b><span>Commissione maturata ({promoter.commissionePercentuale}%)</span></div>
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
              <div className="stat-box"><b>{formattaEuro(statoEventoRevenue.fatturato)}</b><span>Fatturato su questo evento</span></div>
              <div className="stat-box"><b>{formattaEuro(statoEventoRevenue.commissione)}</b><span>Tua commissione su questo evento</span></div>
            </div>
          )}
        </>
      )}

      {voce === 'link' && (
        <>
          <h1 className="page-title" style={{ marginBottom: 6 }}>I tuoi link</h1>
          <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 20 }}>
            Un link per ogni evento — copialo e condividilo dove vuoi. Decidi tu quali pubblicizzare.
          </p>

          {!eventiOrdinati.length && (
            <div className="empty-box">Non ci sono eventi ancora.</div>
          )}

          {eventiOrdinati.map((ev) => <CardLinkPromoter key={ev.id} evento={ev} onCopia={copiaLink} />)}
        </>
      )}

      {voce === 'coupon' && (
        <>
          <h1 className="page-title" style={{ marginBottom: 20 }}>Codici sconto</h1>
          <SezioneCodiciSconto />
        </>
      )}

      <div className="toast" style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', background: 'var(--paper)', color: 'var(--ink)', padding: '12px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, opacity: toast ? 1 : 0, pointerEvents: 'none', transition: 'opacity .25s ease', zIndex: 999 }}>
        {toast}
      </div>
      <CookieBanner />
    </AccountShell>
  );
}

/** Il link per un evento si genera lato server (codice opaco per
 *  quella coppia promoter+evento, mai il nome/codice leggibile nel
 *  link — vedi promoter.routes.ts) — quindi una piccola richiesta per
 *  card invece di costruirlo qui a mano. */
function CardLinkPromoter({ evento, onCopia }: { evento: Evento; onCopia: (link: string) => void }) {
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    promoterApi.meLink(evento.id).then((r) => setLink(r.url)).catch(() => {});
  }, [evento.id]);

  return (
    <div className="evento-link-card">
      <div>
        <h3>{evento.artista}</h3>
        <p>{evento.luogo}, {evento.citta} · {fmtDataBreve(evento.data)}</p>
      </div>
      <div className="link-azione">
        <input type="text" readOnly value={link ?? 'Genero il link...'} />
        <button className="btn btn-ghost" disabled={!link} onClick={() => link && onCopia(link)}>Copia link</button>
      </div>
    </div>
  );
}

/** I codici sconto assegnati a questo promoter — con quante volte
 *  sono stati usati e quanto gli rendono (compenso specifico per il
 *  codice se impostato, altrimenti il tasso di default dell'account —
 *  mostrato comunque per chiarezza). */
function SezioneCodiciSconto() {
  const [coupon, setCoupon] = useState<CouponPromoter[] | null>(null);

  useEffect(() => {
    promoterApi.meCoupon().then(setCoupon).catch(() => setCoupon([]));
  }, []);

  if (coupon === null) return null;
  if (coupon.length === 0) return null; // nessun codice assegnato: nessuna sezione da mostrare

  return (
    <>
      <h2 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, margin: '24px 0 14px' }}>I tuoi codici sconto</h2>
      <p style={{ color: 'var(--mist)', fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Condividi il codice — chi lo usa ha uno sconto, tu una commissione.
      </p>
      {coupon.map((c) => {
        const scadenza = c.validoAl ? new Date(c.validoAl) : null;
        const scaduto = scadenza ? scadenza < new Date() : false;
        const compensoTesto = c.compensoTipo === 'FISSO'
          ? `${formattaEuro(c.compensoValore)} ${c.compensoFissoPer === 'PASSEGGERO' ? 'a passeggero' : 'ad acquisto'}`
          : c.compensoTipo === 'PERCENTUALE' ? `${c.compensoValore}%` : `${c.commissionePercentualeDefault}% (tasso di default)`;
        return (
          <div className="evento-link-card" key={c.codice}>
            <div>
              <h3>{c.codice}</h3>
              <p>
                Sconto: {c.scontoTipo === 'PERCENTUALE' ? `${c.scontoValore}%` : formattaEuro(c.scontoValore)}
                {' · '}Il tuo compenso: <b>{compensoTesto}</b>
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--mist)' }}>
                Usato {c.usiAttuali}{c.usiMax ? ` / ${c.usiMax}` : ''} volt{c.usiAttuali === 1 ? 'a' : 'e'}
                {scadenza && ` · ${scaduto ? 'Scaduto il' : 'Valido fino al'} ${scadenza.toLocaleDateString('it-IT')}`}
                {!c.attivo && ' · Disattivato'}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}
