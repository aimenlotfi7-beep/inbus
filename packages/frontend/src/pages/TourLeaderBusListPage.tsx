import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controlloAccessiApi, type BusAssegnato, nomeTourLeader, logoutTourLeader, tokenTourLeader } from '../api/tourLeaderAuth';

/** Elenco dei bus assegnati a questo tour leader — sceglie quale
 *  scansionare. Un tour leader può avere più bus su più eventi diversi
 *  nel tempo, mostrati tutti insieme. */
export function TourLeaderBusListPage() {
  const [bus, setBus] = useState<BusAssegnato[] | null>(null);
  const [errore, setErrore] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!tokenTourLeader()) { navigate('/scansione/accedi'); return; }
    controlloAccessiApi.busAssegnati()
      .then(setBus)
      .catch((e) => setErrore(e instanceof Error ? e.message : 'Impossibile caricare i bus.'));
  }, [navigate]);

  function esci() {
    logoutTourLeader();
    navigate('/scansione/accedi');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: "'Poppins',sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#14121f', color: '#e7e5f0' }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Ciao, {nomeTourLeader()}</h1>
          <p style={{ color: '#a99fc2', fontSize: 12.5, margin: '2px 0 0' }}>Scegli il bus da controllare</p>
        </div>
        <button onClick={esci} style={{ background: 'none', border: '1px solid rgba(255,255,255,.15)', color: '#a99fc2', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Esci</button>
      </div>

      <div style={{ padding: 20 }}>
        {errore && <p style={{ color: '#dc2626' }}>{errore}</p>}
        {!bus && !errore && <p style={{ color: '#6b7280' }}>Carico...</p>}
        {bus?.length === 0 && <p style={{ color: '#6b7280' }}>Non hai ancora nessun bus assegnato.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bus?.map((b) => (
            <button
              key={b.busId}
              onClick={() => navigate(`/scansione/bus/${b.busId}`)}
              style={{ textAlign: 'left', background: '#fff', border: '1px solid #e3e5ea', borderRadius: 12, padding: 16, color: '#1f2430', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
            >
              <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>{b.eventoArtista}</p>
              <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
                {new Date(b.eventoData).toLocaleDateString('it-IT')} · Bus {b.riferimento}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
