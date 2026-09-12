import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountShell } from '../features/AccountShell';
import { AuthShell } from '../features/AuthShell';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { CampoPassword } from '../features/CampoPassword';
import '../styles/account.css';
import '../styles/promoter.css';
import { promoterApi, type Promoter, type CouponPromoter } from '../api/promoter';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';
import { useSeoTags } from '../features/useSeoTags';
import { formattaEuro, formattaData, plurale } from '../shared/formato';

const CHIAVE_TOKEN = 'inbus_promoter_token';

function fmtDataBreve(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PromoterPage() {
  useSeoTags({
    title: 'Area promoter — OnWay',
    description: 'Accedi all\'area promoter OnWay: i link dei tuoi eventi, i coupon e le vendite.',
    url: `${window.location.origin}/promoter`,
  });
  const [loggato, setLoggato] = useState(() => !!localStorage.getItem(CHIAVE_TOKEN));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setCaricamento(true);
    try {
      const { token } = await promoterApi.login(email, password);
      localStorage.setItem(CHIAVE_TOKEN, token);
      setLoggato(true);
    } catch (err) {
      setErrore(err instanceof ErroreApi ? err.message : 'Impossibile contattare il server.');
    } finally {
      setCaricamento(false);
    }
  }
  function esci() {
    localStorage.removeItem(CHIAVE_TOKEN);
    setLoggato(false);
  }

  // Una volta autenticato, AreaPromoter porta il proprio layout intero
  // (AccountShell); prima di accedere c'è solo il riquadro di accesso,
  // lo stesso guscio delle pagine di accesso del sito in tema chiaro.
  if (loggato) return <AreaPromoter onErroreSessione={esci} />;

  return (
    <AuthShell temaChiaro etichettaTipo="promoter">
      <h1>Area promoter</h1>
      <p className="auth-sottotitolo">
        Accedi con email e password ricevute dallo staff OnWay per generare i link dei tuoi eventi e vedere le vendite.
      </p>

      <form onSubmit={accedi}>
        <CampoTesto
          id="promoter-email" etichetta="Email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <CampoPassword
          id="promoter-password" etichetta="Password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          azione={<Link className="campo-etichetta-link" to="/promoter/password-dimenticata">Password dimenticata?</Link>}
        />

        {errore && <p className="avviso avviso-errore auth-avviso" role="alert">{errore}</p>}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
          {caricamento ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>
    </AuthShell>
  );
}

function AreaPromoter({ onErroreSessione }: { onErroreSessione: () => void }) {
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [stats, setStats] = useState<{ numeroPrenotazioni: number; fatturato: number; commissione: number } | null>(null);
  const [statsPerEvento, setStatsPerEvento] = useState<Record<string, { numeroPrenotazioni: number; fatturato: number; commissione: number }>>({});
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoIncasso, setEventoIncasso] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [voce, setVoce] = useState<'panoramica' | 'link' | 'coupon'>('panoramica');

  useEffect(() => {
    promoterApi.me().then(setPromoter).catch(onErroreSessione);
    promoterApi.meStatistiche().then(setStats).catch(() => {});
    promoterApi.meStatistichePerEvento().then(setStatsPerEvento).catch(() => {});
    // Solo eventi futuri e visibili sul sito: un link per un evento già
    // passato o nascosto porterebbe a una pagina che non vende.
    eventiApi.list({ soloFuturi: true, soloVisibili: true }).then(setEventi).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copiaLink(link: string) {
    navigator.clipboard.writeText(link).then(() => mostraToast('Link copiato')).catch(() => {});
  }
  function mostraToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  function esci() {
    localStorage.removeItem(CHIAVE_TOKEN);
    onErroreSessione();
  }

  if (!promoter || !stats) return <div className="pagina-partner partner-caricamento"><p>Carico…</p></div>;

  // Calcolata dal server (shared/commissionePromoter.ts): non è più
  // sempre "fatturato × un'unica percentuale", un coupon può avere un
  // compenso proprio.
  const commissione = stats.commissione;
  const eventiOrdinati = eventi.slice().sort((a, b) => a.data.localeCompare(b.data));
  const eventiConVendite = eventiOrdinati.filter((ev) => statsPerEvento[ev.id]);
  const statoEventoIncasso = eventoIncasso ? statsPerEvento[eventoIncasso] : null;

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
          <h1 className="page-title">Panoramica</h1>
          <div className="stats-row">
            <div className="stat-box"><b>{stats.numeroPrenotazioni}</b><span>Vendite generate</span></div>
            <div className="stat-box"><b>{formattaEuro(stats.fatturato)}</b><span>Incasso generato</span></div>
            <div className="stat-box"><b>{formattaEuro(commissione)}</b><span>Commissione maturata ({promoter.commissionePercentuale}%)</span></div>
          </div>

          <h2 className="partner-sezione-titolo">Incasso per evento</h2>
          {eventiConVendite.length > 0 ? (
            <div className="mini-tabs partner-tabs">
              {eventiConVendite.map((ev) => (
                <button key={ev.id} type="button" className={`mini-tab${eventoIncasso === ev.id ? ' active' : ''}`} aria-pressed={eventoIncasso === ev.id} onClick={() => setEventoIncasso(ev.id)}>
                  {ev.artista}
                </button>
              ))}
            </div>
          ) : (
            <div className="stato-vuoto">
              <h3>Nessuna vendita ancora</h3>
              <p>Appena arriva la prima, la trovi qui divisa per evento.</p>
            </div>
          )}
          {statoEventoIncasso && (
            <div className="stats-row">
              <div className="stat-box"><b>{statoEventoIncasso.numeroPrenotazioni}</b><span>Vendite su questo evento</span></div>
              <div className="stat-box"><b>{formattaEuro(statoEventoIncasso.fatturato)}</b><span>Incasso su questo evento</span></div>
              <div className="stat-box"><b>{formattaEuro(statoEventoIncasso.commissione)}</b><span>Tua commissione su questo evento</span></div>
            </div>
          )}
        </>
      )}

      {voce === 'link' && (
        <>
          <h1 className="page-title">I tuoi link</h1>
          <p className="page-sub">Un link per ogni evento in vendita: copialo e condividilo dove vuoi. Decidi tu quali pubblicizzare.</p>

          {!eventiOrdinati.length && (
            <div className="stato-vuoto">
              <h3>Nessun evento in vendita</h3>
              <p>Quando OnWay pubblica un nuovo evento, il suo link compare qui.</p>
            </div>
          )}

          {eventiOrdinati.map((ev) => <CardLinkPromoter key={ev.id} evento={ev} onCopia={copiaLink} />)}
        </>
      )}

      {voce === 'coupon' && (
        <>
          <h1 className="page-title">Codici sconto</h1>
          <SezioneCodiciSconto />
        </>
      )}

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
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
        <input type="text" readOnly value={link ?? 'Genero il link…'} aria-label={`Link per ${evento.artista}`} />
        <button type="button" className="btn btn-secondary" disabled={!link} onClick={() => link && onCopia(link)}>Copia link</button>
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

  if (coupon === null) return <p className="page-sub">Carico…</p>;
  if (coupon.length === 0) {
    return (
      <div className="stato-vuoto">
        <h3>Nessun codice sconto assegnato</h3>
        <p>Se ti serve un codice da far usare ai tuoi contatti, chiedilo allo staff OnWay.</p>
      </div>
    );
  }

  return (
    <>
      <p className="page-sub">Condividi il codice: chi lo usa ha uno sconto, tu una commissione.</p>
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
              <p>
                Usato {c.usiMax ? `${c.usiAttuali} / ${plurale(c.usiMax, 'volta', 'volte')}` : plurale(c.usiAttuali, 'volta', 'volte')}
                {scadenza && ` · ${scaduto ? 'Scaduto il' : 'Valido fino al'} ${formattaData(scadenza)}`}
                {!c.attivo && ' · Disattivato'}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}
