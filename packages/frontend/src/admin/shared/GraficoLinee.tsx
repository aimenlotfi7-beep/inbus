// Piccolo grafico a linee fatto a mano in SVG — niente libreria
// esterna (nessuna era già installata nel progetto), il bisogno qui è
// semplice: poche linee, pochi punti, non serve altro.

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

export interface SerieGrafico {
  nome: string;
  punti: { x: string; y: number }[]; // x = etichetta (es. una data), in ordine
}

/** Disegna una linea per ogni serie passata, tutte sullo stesso asse X
 *  (l'unione ordinata di tutte le etichette X viste in qualunque
 *  serie) — se una serie non ha un punto per una certa X, la linea
 *  "salta" da un punto noto al successivo, senza inventare un valore
 *  a metà. */
export function GraficoLinee({ serie, altezza = 220 }: { serie: SerieGrafico[]; altezza?: number }) {
  const tutteLeX = [...new Set(serie.flatMap((s) => s.punti.map((p) => p.x)))].sort();
  if (tutteLeX.length === 0 || serie.every((s) => s.punti.length === 0)) {
    return <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>Nessun dato ancora per il grafico.</p>;
  }

  const larghezza = 600;
  const margine = { sopra: 10, sotto: 24, sinistra: 34, destra: 10 };
  const areaW = larghezza - margine.sinistra - margine.destra;
  const areaH = altezza - margine.sopra - margine.sotto;

  const maxY = Math.max(1, ...serie.flatMap((s) => s.punti.map((p) => p.y)));
  const xPos = (x: string) => margine.sinistra + (tutteLeX.indexOf(x) / Math.max(1, tutteLeX.length - 1)) * areaW;
  const yPos = (y: number) => margine.sopra + areaH - (y / maxY) * areaH;

  return (
    <div>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: '100%', height: altezza }}>
        {/* Righe guida orizzontali, con l'etichetta del valore */}
        {[0, 0.5, 1].map((frazione) => (
          <g key={frazione}>
            <line x1={margine.sinistra} x2={larghezza - margine.destra} y1={yPos(maxY * frazione)} y2={yPos(maxY * frazione)} stroke="var(--line)" strokeWidth={1} />
            <text x={margine.sinistra - 6} y={yPos(maxY * frazione) + 4} textAnchor="end" fontSize={10} fill="var(--mist)">{Math.round(maxY * frazione)}</text>
          </g>
        ))}
        {/* Etichette sull'asse X — solo prima, meta' e ultima, per non affollare */}
        {[0, Math.floor((tutteLeX.length - 1) / 2), tutteLeX.length - 1].map((i) => (
          <text key={i} x={xPos(tutteLeX[i])} y={altezza - 6} textAnchor="middle" fontSize={10} fill="var(--mist)">
            {tutteLeX[i]?.slice(5) /* taglio l'anno, solo mese-giorno */}
          </text>
        ))}
        {serie.map((s, idx) => {
          const colore = PALETTE[idx % PALETTE.length];
          if (s.punti.length === 0) return null;
          const d = s.punti.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.x)} ${yPos(p.y)}`).join(' ');
          return (
            <g key={s.nome}>
              <path d={d} fill="none" stroke={colore} strokeWidth={2} />
              {s.punti.map((p) => (
                <circle key={p.x} cx={xPos(p.x)} cy={yPos(p.y)} r={2.5} fill={colore} />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6 }}>
        {serie.map((s, idx) => (
          <span key={s.nome} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--mist)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: PALETTE[idx % PALETTE.length], flexShrink: 0 }} />
            {s.nome}
          </span>
        ))}
      </div>
    </div>
  );
}
