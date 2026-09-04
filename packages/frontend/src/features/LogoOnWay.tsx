import { Link } from 'react-router-dom';

/** Logotipo OnWay.
 *
 *  La W è disegnata su misura (SVG), non è un carattere: nessun font la
 *  contiene. Il tratto usa currentColor, quindi il logo segue il colore
 *  del testo del contenitore — su fondo chiaro basta la classe
 *  `logo-su-chiaro` sul link.
 *
 *  `freccia="mono"` rende anche la punta in currentColor: da usare dove
 *  il giallo non deve entrare (biglietto in bianco e nero, stampa,
 *  gestionale).
 */
export function LogoOnWay({
  come = 'link',
  freccia = 'giallo',
  chiaro = false,
}: {
  come?: 'link' | 'testo';
  freccia?: 'giallo' | 'mono';
  chiaro?: boolean;
}) {
  const contenuto = (
    <>
      <span className="logo-on">on</span>
      <svg className="logo-w" viewBox="0 -6 124 98" fill="none" aria-hidden="true">
        <polyline
          points="8,32 30,84 52,40 74,68 102,20"
          stroke="currentColor"
          strokeWidth="17"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon
          points="115.1,-2.4 118.4,29.6 85.6,10.4"
          fill={freccia === 'mono' ? 'currentColor' : '#FFD400'}
        />
      </svg>
      <span className="logo-ay">ay</span>
    </>
  );

  const classe = `logo${chiaro ? ' logo-su-chiaro' : ''}`;

  // aria-label esplicita: il nome è composto da tre pezzi (testo + SVG +
  // testo), quindi da solo uno screen reader leggerebbe "on ay".
  if (come === 'testo') {
    return <span className={classe} aria-label="OnWay" role="img">{contenuto}</span>;
  }
  return (
    <Link to="/" className={classe} aria-label="OnWay">
      {contenuto}
    </Link>
  );
}
