import { Link } from 'react-router-dom';

/** Logotipo OnWay.
 *
 *  La W è disegnata su misura (SVG), non è un carattere. Il tratto usa
 *  currentColor, quindi la W segue il colore del testo: su fondo chiaro
 *  basta la classe `logo-su-chiaro` sul link.
 *
 *  I pin usano un colore proprio, con regole fisse:
 *    - logo principale (W gialla)  -> pin bianchi
 *    - W bianca                    -> pin neri
 *    - W nera                      -> pin bianchi
 *  La testa del pin è larga esattamente come il tratto (17 unità su 17),
 *  quindi copre la calotta della W senza lasciare alone.
 */
const PIN = 'M-7.70,3.60 L-2.72,14.27 A3,3 0 0,0 2.72,14.27 L7.70,3.60 A8.5,8.5 0 1,0 -7.70,3.60 Z';

export function LogoOnWay({
  come = 'link',
  variante = 'principale',
  chiaro = false,
}: {
  come?: 'link' | 'testo';
  variante?: 'principale' | 'bianca' | 'nera';
  chiaro?: boolean;
}) {
  const trattoW =
    variante === 'principale' ? '#FFD400' : 'currentColor';
  const pin =
    variante === 'bianca' ? '#14161A' : '#FFFFFF';

  const contenuto = (
    <>
      <span className="logo-on">On</span>
      <svg
        className="logo-w"
        viewBox="-5.9 -0.12 121.8 97"
        fill="none"
        aria-hidden="true"
      >
        <polyline
          points="8,46 30,90 52,38 74,62 102,10"
          stroke={trattoW}
          strokeWidth="17"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={PIN} fill={pin} transform="translate(8 46) rotate(-26.57)" />
        <path d={PIN} fill={pin} transform="translate(102 10) rotate(28.30)" />
      </svg>
      <span className="logo-ay">aY</span>
    </>
  );

  // aria-label esplicita: il nome è composto da tre pezzi (testo + SVG +
  // testo), quindi da solo uno screen reader leggerebbe "On aY".
  const classe = `logo${chiaro ? ' logo-su-chiaro' : ''}`;

  if (come === 'testo') {
    return (
      <span className={classe} aria-label="OnWay" role="img">
        {contenuto}
      </span>
    );
  }
  return (
    <Link to="/" className={classe} aria-label="OnWay">
      {contenuto}
    </Link>
  );
}
