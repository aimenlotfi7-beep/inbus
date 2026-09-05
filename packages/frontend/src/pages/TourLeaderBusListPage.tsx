import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controlloAccessiApi, type BusAssegnato, tokenTourLeader } from '../api/tourLeaderAuth';
import { TourLeaderLayout } from '../features/TourLeaderLayout';

export function TourLeaderBusListPage() {
  const [bus, setBus] = useState<BusAssegnato[] | null>(null);
  const [errore, setErrore] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!tokenTourLeader()) { navigate('/scansione/accedi'); return; }
    controlloAccessiApi.busAssegnati()
      .then(setBus)
      .catch((e) => setErrore(e instanceof Error ? e.message : 'Impossibile caricare gli eventi.'));
  }, [navigate]);

  return (
    <TourLeaderLayout vocedAttiva="eventi">
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: '0 0 4px' }}>I tuoi eventi</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, marginBottom: 20 }}>Ogni evento a cui sei assegnato — apri per vedere i partecipanti o scansionare.</p>

      {errore && <p style={{ color: 'var(--ow-danger-ink, #A31414)' }}>{errore}</p>}
      {!bus && !errore && <p style={{ color: '#6b7280' }}>Carico...</p>}
      {bus?.length === 0 && <p style={{ color: '#6b7280' }}>Non hai ancora nessun evento assegnato.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bus?.map((b) => (
          <div key={b.busId} style={{ background: '#fff', border: '1px solid #e3e5ea', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 4px', color: '#1f2430' }}>{b.eventoArtista}</p>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 12px' }}>
              {new Date(b.eventoData).toLocaleDateString('it-IT')} · Bus {b.riferimento}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                disabled
                title="Non ancora disponibile — arriverà inviata dal gestionale"
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e3e5ea', background: '#f3f4f6', color: '#9ca3af', fontSize: 13, cursor: 'not-allowed' }}
              >
                📋 Lista partecipanti
              </button>
              <button
                onClick={() => navigate(`/scansione/bus/${b.busId}`)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                📷 Scansiona
              </button>
            </div>
          </div>
        ))}
      </div>
    </TourLeaderLayout>
  );
}
