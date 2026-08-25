import { useEffect, useState } from 'react';
import { commissioniApi, type RegolaCommissione } from '../../api/organizzatori';

export function PannelloCommissione({ organizzatoreId }: { organizzatoreId: string }) {
  const [attiva, setAttiva] = useState<RegolaCommissione | null>(null);
  const [storico, setStorico] = useState<RegolaCommissione[]>([]);
  const [nuovaPercentuale, setNuovaPercentuale] = useState('');
  const [salvando, setSalvando] = useState(false);

  function ricarica() {
    commissioniApi.get(organizzatoreId).then((r) => { setAttiva(r.attiva); setStorico(r.storico); });
  }
  useEffect(ricarica, [organizzatoreId]);

  async function salva() {
    const valore = Number(nuovaPercentuale);
    if (Number.isNaN(valore) || valore < 0 || valore > 100) return;
    setSalvando(true);
    try {
      await commissioniApi.imposta(organizzatoreId, valore);
      setNuovaPercentuale('');
      ricarica();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="section-card" style={{ marginTop: 20, padding: '14px 16px' }}>
      <p className="section-label" style={{ marginBottom: 10 }}>Commissione</p>
      <p style={{ fontSize: 13, marginBottom: 10 }}>
        Percentuale attuale: <b>{attiva ? `${attiva.percentuale}%` : 'nessuna impostata (0%)'}</b>
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          type="number" min={0} max={100} step={0.5} placeholder="Nuova percentuale, es. 10"
          value={nuovaPercentuale} onChange={(e) => setNuovaPercentuale(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={salva} disabled={!nuovaPercentuale || salvando}>
          {salvando ? 'Salvo...' : 'Imposta'}
        </button>
      </div>
      {storico.length > 1 && (
        <details>
          <summary style={{ fontSize: 12, color: 'var(--mist)', cursor: 'pointer' }}>Storico ({storico.length})</summary>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {storico.map((r) => (
              <p key={r.id} style={{ fontSize: 12, color: 'var(--mist)' }}>
                {r.percentuale}% — dal {new Date(r.validoDal).toLocaleDateString('it-IT')}
                {r.validoA ? ` al ${new Date(r.validoA).toLocaleDateString('it-IT')}` : ' (attiva)'}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
