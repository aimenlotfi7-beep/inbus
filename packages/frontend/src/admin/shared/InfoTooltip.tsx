import { useState } from 'react';

export function InfoTooltip({ children }: { children: React.ReactNode }) {
  const [aperto, setAperto] = useState(false);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }}
      onMouseEnter={() => setAperto(true)}
      onMouseLeave={() => setAperto(false)}
    >
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-label="Informazioni"
        style={{
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--mist)', background: 'none',
          color: 'var(--mist)', fontSize: 10.5, lineHeight: 1, cursor: 'help', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontFamily: 'serif',
        }}
      >
        i
      </button>
      {aperto && (
        <span
          style={{
            position: 'absolute', zIndex: 50, top: '135%', left: 0, minWidth: 220, maxWidth: 320,
            background: 'var(--paper, #1f2430)', color: '#fff', fontSize: 12, lineHeight: 1.5,
            padding: '10px 12px', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.18)', fontWeight: 400,
            textTransform: 'none', letterSpacing: 'normal',
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
