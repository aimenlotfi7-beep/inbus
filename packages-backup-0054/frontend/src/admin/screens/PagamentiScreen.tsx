import { useEffect, useState } from 'react';
import { prenotazioniAdminApi, type PrenotazioneRiga } from '../../api/prenotazioniAdmin';
import { PanelHead } from '../shared/PanelHead';

export function PagamentiScreen() {
  const [righe, setRighe] = useState<PrenotazioneRiga[]>([]);
  useEffect(() => { prenotazioniAdminApi.listAll().then(setRighe); }, []);

  const confermate = righe.filter((r) => r.stato === 'CONFERMATA');
  const incassoTotale = confermate.reduce((s, r) => s + Number(r.totale), 0);
  const perMetodo = confermate.reduce<Record<string, number>>((acc, r) => {
    acc[r.metodoPagamento] = (acc[r.metodoPagamento] ?? 0) + Number(r.totale);
    return acc;
  }, {});
  const inAttesaSaldo = confermate.filter((r) => r.tipoPagamento === 'ACCONTO' && !r.saldoPagato);

  return (
    <div>
      <PanelHead titolo="Pagamenti" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 26 }}>
        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 24 }}>€{incassoTotale.toFixed(2)}</div>
          <div style={{ color: 'var(--mist)', fontSize: 12 }}>Incassato totale</div>
        </div>
        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 24 }}>{inAttesaSaldo.length}</div>
          <div style={{ color: 'var(--mist)', fontSize: 12 }}>Acconti in attesa di saldo</div>
        </div>
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Incassi per metodo di pagamento</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
        {Object.entries(perMetodo).map(([metodo, importo]) => (
          <div key={metodo} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', fontSize: 13.5 }}>
            <span>{metodo}</span><span>€{importo.toFixed(2)}</span>
          </div>
        ))}
        {!Object.keys(perMetodo).length && <p style={{ color: 'var(--mist)' }}>Nessun pagamento registrato ancora.</p>}
      </div>
    </div>
  );
}
