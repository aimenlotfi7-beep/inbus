import { useRef, useState } from 'react';

/** La "i" con la spiegazione al passaggio del mouse (o al tocco). Con
 *  `fisso` il riquadro si apre sopra tutto, allineato al bordo della
 *  finestra: serve dentro le tabelle che scorrono, che altrimenti lo
 *  taglierebbero. */
export function InfoTooltip({ children, fisso = false }: { children: React.ReactNode; fisso?: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [posizione, setPosizione] = useState<{ top: number; left: number } | null>(null);
  const pulsante = useRef<HTMLButtonElement>(null);

  function apri(valore: boolean) {
    if (valore && fisso && pulsante.current) {
      const r = pulsante.current.getBoundingClientRect();
      setPosizione({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 336)) });
    }
    setAperto(valore);
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }}
      onMouseEnter={() => apri(true)}
      onMouseLeave={() => apri(false)}
    >
      <button
        ref={pulsante}
        type="button"
        onClick={(e) => { e.stopPropagation(); apri(!aperto); }}
        aria-label="Informazioni"
        aria-expanded={aperto}
        style={{
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--mist)', background: 'none',
          color: 'var(--mist)', fontSize: 'var(--testo-xs)', lineHeight: 1, cursor: 'help', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontFamily: 'serif',
        }}
      >
        i
      </button>
      {aperto && (
        <span
          role="tooltip"
          style={{
            ...(fisso && posizione ? { position: 'fixed', top: posizione.top, left: posizione.left } : { position: 'absolute', top: '135%', left: 0 }),
            zIndex: 50, minWidth: 220, maxWidth: 320, whiteSpace: 'normal', textAlign: 'left',
            background: 'var(--paper, #1f2430)', color: '#fff', fontSize: 'var(--testo-sm)', lineHeight: 1.5,
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
