import { useEffect, useState } from 'react';
import { statisticheApi, type StatisticheGenerali, type ConfrontoMesi } from '../api/statistiche';
import { preventiviApi } from '../api/preventivi';
import { LogoOnWay } from '../features/LogoOnWay';

function CardStat({ numero, etichetta }: { numero: string; etichetta: string }) {
  return (
    <div className="dash-card">
      <div className="num">{numero}</div>
      <div className="lbl">{etichetta}</div>
    </div>
  );
}

type Periodo = 'sei-mesi' | 'anno' | 'tutto';

function dataDaPeriodo(periodo: Periodo): string | undefined {
  if (periodo === 'tutto') return undefined;
  const d = new Date();
  d.setMonth(d.getMonth() - (periodo === 'sei-mesi' ? 6 : 12));
  return d.toISOString();
}

/** Tab "Preventivi" — statistiche per fornitore (quante richieste,
 *  quante risposte, quante volte scelto, prezzo medio) e storico
 *  prezzi per tratta (con €/km, per confrontare tratte con un numero
 *  diverso di fermate) — vedi conversazione. Prima tab con struttura a
 *  schede dentro questa schermata, prima era una vista unica. */
function TabPreventivi() {
  const [periodo, setPeriodo] = useState<Periodo>('tutto');
  const [fornitori, setFornitori] = useState<Awaited<ReturnType<typeof preventiviApi.statistichePerFornitore>>>([]);
  const [tratte, setTratte] = useState<Awaited<ReturnType<typeof preventiviApi.storicoPerTratta>>>([]);

  useEffect(() => {
    const dataDa = dataDaPeriodo(periodo);
    preventiviApi.statistichePerFornitore(dataDa).then(setFornitori).catch(() => setFornitori([]));
    preventiviApi.storicoPerTratta(dataDa).then(setTratte).catch(() => setTratte([]));
  }, [periodo]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} style={{ width: 'auto' }}>
          <option value="sei-mesi">Ultimi 6 mesi</option>
          <option value="anno">Ultimo anno</option>
          <option value="tutto">Tutto lo storico</option>
        </select>
      </div>

      <p className="section-label" style={{ marginBottom: 8 }}>Per fornitore</p>
      {fornitori.length === 0 ? (
        <p className="testo-intro" style={{ marginBottom: 24 }}>Nessun fornitore contattato in questo periodo.</p>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 24 }}>
          <table className="data-table">
            <thead><tr><th>Fornitore</th><th>Richieste</th><th>Risposte</th><th>Scelto</th><th>Prezzo medio</th></tr></thead>
            <tbody>
              {fornitori.map((f) => (
                <tr key={f.fornitore.id}>
                  <td>{f.fornitore.nome}</td>
                  <td>{f.richiesteRicevute}</td>
                  <td>{f.risposteDate}</td>
                  <td style={{ fontWeight: f.volteScelto > 0 ? 700 : 400, color: f.volteScelto > 0 ? 'var(--green)' : undefined }}>{f.volteScelto}</td>
                  <td>{f.prezzoMedio != null ? `€${f.prezzoMedio.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="section-label" style={{ marginBottom: 8 }}>Storico prezzi per tratta</p>
      {tratte.length === 0 ? (
        <p className="testo-intro">Nessun preventivo accettato in questo periodo.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Tratta</th><th>Evento</th><th>Data</th><th>Prezzo</th><th>€/km</th></tr></thead>
            <tbody>
              {tratte.map((t, i) => (
                <tr key={i}>
                  <td>{t.partenza} → {t.arrivo}</td>
                  <td>{t.artista}</td>
                  <td>{new Date(t.data).toLocaleDateString('it-IT')}</td>
                  <td>€{t.prezzo.toFixed(2)}</td>
                  <td>{t.km ? `€${(t.prezzo / t.km).toFixed(2)}/km` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminDashboard({ onLogout, soloContenuto }: { onLogout: () => void; soloContenuto?: boolean }) {
  const [generali, setGenerali] = useState<StatisticheGenerali | null>(null);
  const [confronto, setConfronto] = useState<ConfrontoMesi | null>(null);
  const [tab, setTab] = useState<'generale' | 'preventivi'>('generale');

  useEffect(() => {
    statisticheApi.generali().then(setGenerali);
    statisticheApi.confrontoMesi().then(setConfronto);
  }, []);

  const variazione = confronto && confronto.mesePrecedente > 0
    ? ((confronto.meseCorrente - confronto.mesePrecedente) / confronto.mesePrecedente) * 100
    : 0;

  const contenuto = (
    <>
      <div className="panel-head"><h2>Statistiche</h2></div>
      <div className="mini-tabs" style={{ marginBottom: 18 }}>
        <button type="button" className={`mini-tab${tab === 'generale' ? ' active' : ''}`} onClick={() => setTab('generale')}>Generale</button>
        <button type="button" className={`mini-tab${tab === 'preventivi' ? ' active' : ''}`} onClick={() => setTab('preventivi')}>Preventivi</button>
      </div>
      {tab === 'generale' ? (
        <div className="dash-grid">
          {generali && (
            <>
              <CardStat numero={`€${generali.incassoTotale.toFixed(2)}`} etichetta="Incasso totale" />
              <CardStat numero={String(generali.numeroPrenotazioni)} etichetta="Prenotazioni confermate" />
              <CardStat numero={String(generali.numeroEventi)} etichetta="Eventi in catalogo" />
            </>
          )}
          {confronto && (
            <>
              <CardStat numero={`€${confronto.meseCorrente.toFixed(0)}`} etichetta="Incasso mese corrente" />
              <CardStat numero={`€${confronto.mesePrecedente.toFixed(0)}`} etichetta="Incasso mese scorso" />
              <CardStat numero={`${variazione >= 0 ? '+' : ''}${variazione.toFixed(1)}%`} etichetta="Variazione" />
            </>
          )}
        </div>
      ) : (
        <TabPreventivi />
      )}
    </>
  );

  if (soloContenuto) return <div>{contenuto}</div>;

  return (
    <div>
      <header style={{ padding: '18px clamp(20px,5vw,64px)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="logo"><LogoOnWay come="testo" variante="nera" /> <small>gestionale</small></div>
        <button className="btn btn-ghost" onClick={onLogout}>Esci</button>
      </header>
      <main style={{ padding: 'clamp(20px,4vw,40px)' }}>{contenuto}</main>
    </div>
  );
}
