import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controlloAccessiApi, type RisultatoRicerca, tokenTourLeader } from '../api/tourLeaderAuth';
import { TourLeaderLayout } from '../features/TourLeaderLayout';

export function TourLeaderCercaPage() {
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<RisultatoRicerca[] | null>(null);
  const [cercando, setCercando] = useState(false);
  const [checkinInCorso, setCheckinInCorso] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!tokenTourLeader()) navigate('/scansione/accedi');
  }, [navigate]);

  useEffect(() => {
    if (query.trim().length < 2) { setRisultati(null); return; }
    setCercando(true);
    const id = setTimeout(() => {
      controlloAccessiApi.cerca(query).then(setRisultati).finally(() => setCercando(false));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  async function faiCheckin(r: RisultatoRicerca) {
    if (!confirm(`Confermare la salita di ${r.nome} ${r.cognome}?`)) return;
    setCheckinInCorso(r.partecipanteId);
    try {
      await controlloAccessiApi.checkinManuale(r.partecipanteId);
      setRisultati((prev) => prev?.map((x) => x.partecipanteId === r.partecipanteId ? { ...x, giaSalito: true } : x) ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Check-in non riuscito.');
    } finally {
      setCheckinInCorso(null);
    }
  }

  return (
    <TourLeaderLayout vocedAttiva="cerca">
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: '0 0 4px' }}>Cerca passeggero</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, marginBottom: 20 }}>Nome, cognome o PNR — su tutti i tuoi eventi insieme.</p>

      <input
        type="text"
        autoFocus
        placeholder="es. Mario Rossi, o IB4X7K2..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', maxWidth: 400, padding: '11px 14px', borderRadius: 10, border: '1px solid #e3e5ea', background: '#fff', color: '#1f2430', fontSize: 15, marginBottom: 20 }}
      />

      {cercando && <p style={{ color: '#6b7280', fontSize: 13 }}>Cerco...</p>}
      {!cercando && query.trim().length >= 2 && risultati?.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>Nessun passeggero trovato con questi dati, sui tuoi eventi.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {risultati?.map((r) => (
          <div key={r.partecipanteId} style={{ background: '#fff', border: '1px solid #e3e5ea', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14.5, margin: 0, color: '#1f2430' }}>{r.nome} {r.cognome}</p>
              <p style={{ color: '#6b7280', fontSize: 12.5, margin: '2px 0 0' }}>PNR {r.pnr} · da {r.fermataCitta}</p>
            </div>
            {r.giaSalito ? (
              <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>✓ Già a bordo</span>
            ) : (
              <button
                onClick={() => faiCheckin(r)}
                disabled={checkinInCorso === r.partecipanteId}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {checkinInCorso === r.partecipanteId ? '...' : 'Check-in'}
              </button>
            )}
          </div>
        ))}
      </div>
    </TourLeaderLayout>
  );
}
