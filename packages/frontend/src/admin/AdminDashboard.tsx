import { useEffect, useState } from 'react';
import { statisticheApi, type StatisticheGenerali, type ConfrontoMesi } from '../api/statistiche';
import { LogoOnWay } from '../features/LogoOnWay';

function CardStat({ numero, etichetta }: { numero: string; etichetta: string }) {
  return (
    <div className="dash-card">
      <div className="num">{numero}</div>
      <div className="lbl">{etichetta}</div>
    </div>
  );
}

export function AdminDashboard({ onLogout, soloContenuto }: { onLogout: () => void; soloContenuto?: boolean }) {
  const [generali, setGenerali] = useState<StatisticheGenerali | null>(null);
  const [confronto, setConfronto] = useState<ConfrontoMesi | null>(null);

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
    </>
  );

  if (soloContenuto) return <div>{contenuto}</div>;

  return (
    <div>
      <header style={{ padding: '18px clamp(20px,5vw,64px)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="logo"><LogoOnWay come="testo" freccia="mono" /> <small>gestionale</small></div>
        <button className="btn btn-ghost" onClick={onLogout}>Esci</button>
      </header>
      <main style={{ padding: 'clamp(20px,4vw,40px)' }}>{contenuto}</main>
    </div>
  );
}
