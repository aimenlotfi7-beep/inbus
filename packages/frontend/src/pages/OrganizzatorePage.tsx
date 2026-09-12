import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountShell, type VoceMenuAccount } from '../features/AccountShell';
import { AuthShell } from '../features/AuthShell';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { CampoPassword } from '../features/CampoPassword';
import '../styles/account.css';
import '../styles/promoter.css';
import { organizzatoriApi, type Organizzatore, type EventoAssegnato, type StatisticheGenerali, type StatisticaEvento, type StatisticaBundle } from '../api/organizzatori';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';
import { useSeoTags } from '../features/useSeoTags';
import { formattaEuro, plurale } from '../shared/formato';

const CHIAVE_TOKEN = 'inbus_organizzatore_token';

function fmtDataBreve(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function OrganizzatorePage() {
  useSeoTags({
    title: 'Area organizzatore — OnWay',
    description: 'Accedi all\'area organizzatore OnWay: i tuoi eventi e le vendite in un posto solo.',
    url: `${window.location.origin}/organizzatore`,
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
      const { token } = await organizzatoriApi.login(email, password);
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

  if (loggato) return <AreaOrganizzatore onErroreSessione={esci} />;

  return (
    <>
      <AuthShell temaChiaro etichettaTipo="organizzatore">
        <h1>Area organizzatore</h1>
        <p className="auth-sottotitolo">
          Accedi con email e password ricevute dallo staff OnWay per vedere gli eventi che ti sono stati associati.
        </p>

        <form onSubmit={accedi}>
          <CampoTesto
            id="org-email" etichetta="Email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <CampoPassword
            id="org-password" etichetta="Password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            azione={<Link className="campo-etichetta-link" to="/organizzatore/password-dimenticata">Password dimenticata?</Link>}
          />

          {errore && <p className="avviso avviso-errore auth-avviso" role="alert">{errore}</p>}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={caricamento}>
            {caricamento ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </AuthShell>
      <CookieBanner />
    </>
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
    organizzatoriApi.meEventi().then(setEventi).catch(() => setEventi([]));
    organizzatoriApi.meStatistiche().then(setGenerali).catch(() => {});
    organizzatoriApi.meStatistichePerEvento().then(setPerEvento).catch(() => {});
    organizzatoriApi.meStatistichePerBundle().then(setPerBundle).catch(() => setPerBundle([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function esci() {
    localStorage.removeItem(CHIAVE_TOKEN);
    onErroreSessione();
  }

  if (!organizzatore || !eventi) return <div className="pagina-partner partner-caricamento"><p>Carico…</p></div>;

  const eventiOrdinati = eventi.slice().sort((a, b) => a.data.localeCompare(b.data));

  function statoPerEvento(eventoId: string) {
    return perEvento?.find((s) => s.eventoId === eventoId) ?? null;
  }

  const voci: VoceMenuAccount[] = [{ id: 'panoramica', label: 'Panoramica' }, { id: 'eventi', label: 'I tuoi eventi' }];
  if (perBundle.length > 0) voci.push({ id: 'bundle', label: 'I tuoi bundle' });

  const statoVuotoEventi = (
    <div className="stato-vuoto">
      <h2>Nessun evento associato</h2>
      <p>Contatta OnWay per farti assegnare i tuoi eventi: compariranno qui con viaggiatori e incassi.</p>
    </div>
  );

  return (
    <AccountShell
      etichettaTipo="organizzatore" nomeUtente={organizzatore.nome} onLogout={esci} temaChiaro
      voci={voci} voceAttiva={voce} onCambiaVoce={(v) => setVoce(v as typeof voce)}
    >
      {voce === 'panoramica' && (
        <>
          <h1 className="page-title">Panoramica</h1>
          {generali && (
            <section className="pannello partner-pannello">
              <h2>I tuoi numeri</h2>
              <div className="stats-griglia">
                <div className="stat-box"><b>{generali.eventiAttivi}</b><span>Eventi attivi</span></div>
                <div className="stat-box"><b>{generali.viaggiatori}</b><span>Viaggiatori</span></div>
                <div className="stat-box"><b>{formattaEuro(generali.fatturato)}</b><span>Incasso</span></div>
                <div className="stat-box"><b>{formattaEuro(generali.quotaOrganizzatore)}</b><span>Tua quota</span></div>
              </div>
            </section>
          )}
          {!eventiOrdinati.length && statoVuotoEventi}
        </>
      )}

      {voce === 'eventi' && (
        <>
          <h1 className="page-title">I tuoi eventi</h1>
          {!eventiOrdinati.length && statoVuotoEventi}
          {eventiOrdinati.map((ev) => {
            const s = statoPerEvento(ev.id);
            return (
              <div className="evento-link-card" key={ev.id}>
                <div>
                  <h2>{ev.artista}</h2>
                  <p>{ev.luogo}, {ev.citta} · {fmtDataBreve(ev.data)}</p>
                  {s && (
                    <p className="partner-dettaglio">
                      {plurale(s.viaggiatori, 'viaggiatore', 'viaggiatori')} · {formattaEuro(s.fatturato)} di incasso · tua quota {formattaEuro(s.quotaOrganizzatore)}
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
          <h1 className="page-title">I tuoi bundle</h1>
          <p className="page-sub">
            Gli stessi acquisti contano anche sotto ogni evento: questa è una vista in più, non una somma a parte.
          </p>
          {perBundle.map((b) => (
            <div className="evento-link-card" key={b.bundleId}>
              <div>
                <h2>{b.bundleNome} <span className="partner-etichetta">bundle</span></h2>
                <p className="partner-dettaglio">
                  {plurale(b.numeroOrdini, 'ordine', 'ordini')} · {plurale(b.viaggiatori, 'viaggiatore', 'viaggiatori')} · {formattaEuro(b.fatturato)} di incasso (sconto applicato {formattaEuro(b.scontoApplicato)}) · tua quota {formattaEuro(b.quotaOrganizzatore)}
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
