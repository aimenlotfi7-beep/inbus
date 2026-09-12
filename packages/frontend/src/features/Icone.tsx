import type { SVGProps } from 'react';

/** Le poche icone del sito pubblico, disegnate qui a mano (nessuna
 *  libreria, come da regola del progetto): tratto in currentColor, 24×24,
 *  decorative (aria-hidden), il significato lo dà sempre il testo accanto.
 *  Sostituiscono le emoji 🚌 📍 📅 ✓ 🔒 nelle card e nelle pagine. */
export type NomeIcona = 'calendario' | 'pin' | 'orologio' | 'bus' | 'spunta' | 'freccia' | 'lucchetto' | 'cerca' | 'chiudi' | 'utenti';

const TRACCIATI: Record<NomeIcona, React.ReactNode> = {
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  orologio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="4" width="16" height="14" rx="2.5" />
      <path d="M4 11h16M8 18v2M16 18v2" />
      <circle cx="8.5" cy="14.5" r="1" />
      <circle cx="15.5" cy="14.5" r="1" />
    </>
  ),
  spunta: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  freccia: <path d="M5 12h14M13 6l6 6-6 6" />,
  lucchetto: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  cerca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  chiudi: <path d="M6 6l12 12M18 6L6 18" />,
  utenti: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="16.5" cy="9" r="2.6" />
      <path d="M15 14.2a4.5 4.5 0 0 1 5.5 4.3" />
    </>
  ),
};

export function Icona({ nome, dimensione = 20, ...resto }: { nome: NomeIcona; dimensione?: number } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={dimensione}
      height={dimensione}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {TRACCIATI[nome]}
    </svg>
  );
}
