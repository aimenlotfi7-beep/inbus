import type { ReactNode } from 'react';
import { LogoOnWay } from './LogoOnWay';
import { Link, useNavigate } from 'react-router-dom';
import { nomeTourLeader, logoutTourLeader } from '../api/tourLeaderAuth';

export function TourLeaderLayout({ vocedAttiva, children }: { vocedAttiva: 'cerca' | 'eventi'; children: ReactNode }) {
  const navigate = useNavigate();

  function esci() {
    logoutTourLeader();
    navigate('/scansione/accedi');
  }

  return (
    <div className="tourleader-shell" style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Poppins',sans-serif", background: '#f3f4f6' }}>
      <aside className="tourleader-aside" style={{ width: 210, flexShrink: 0, background: '#14121f', color: '#e7e5f0', display: 'flex', flexDirection: 'column', padding: '20px 0' }}>
        <div style={{ padding: '0 20px 20px' }}><LogoOnWay come="testo" chiaro /></div>
        <nav className="tourleader-nav" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <Link
            to="/scansione/cerca"
            style={{ padding: '11px 20px', fontSize: 14, textDecoration: 'none', color: vocedAttiva === 'cerca' ? '#fff' : '#a99fc2', background: vocedAttiva === 'cerca' ? 'rgba(37,99,235,.25)' : 'transparent', borderLeft: vocedAttiva === 'cerca' ? '3px solid #2563eb' : '3px solid transparent' }}
          >
            🔍 Cerca
          </Link>
          <Link
            to="/scansione"
            style={{ padding: '11px 20px', fontSize: 14, textDecoration: 'none', color: vocedAttiva === 'eventi' ? '#fff' : '#a99fc2', background: vocedAttiva === 'eventi' ? 'rgba(37,99,235,.25)' : 'transparent', borderLeft: vocedAttiva === 'eventi' ? '3px solid #2563eb' : '3px solid transparent' }}
          >
            📅 Eventi
          </Link>
        </nav>
        <div className="tourleader-piede" style={{ padding: '14px 20px 0', borderTop: '1px solid rgba(255,255,255,.1)', marginTop: 10 }}>
          <p style={{ fontSize: 12, color: '#a99fc2', margin: '10px 0' }}>{nomeTourLeader()}</p>
          <button onClick={esci} style={{ background: 'none', border: '1px solid rgba(255,255,255,.15)', color: '#a99fc2', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', width: '100%' }}>Esci</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</main>
    </div>
  );
}
