import type { WhiteLabelTheme } from '../../api/whiteLabel';

/** Punti di partenza pronti per una White Label: cambiano colori, font e
 *  forme, mai le immagini, i testi o cosa mostrare (quelli restano scelte
 *  del cliente). Da qui si aggiusta il resto a mano. */
export interface TemaPronto {
  nome: string;
  descrizione: string;
  parti: Pick<WhiteLabelTheme, 'colori' | 'tipografia' | 'stile'>;
}

export const TEMI_PRONTI: TemaPronto[] = [
  {
    nome: 'Notte',
    descrizione: 'Scuro con accento acceso, come il sito OnWay.',
    parti: {
      colori: {
        sfondo: '#14121f', superficie: '#1f1c2e', testoPrincipale: '#f5f3ff', testoSecondario: '#a99fc2', bordi: '#2c2740',
        cta: '#ff2d78', testoCta: '#ffffff', ctaSecondaria: '#1f1c2e', testoCtaSecondaria: '#f5f3ff', accento: '#ff2d78',
        campoSfondo: '#14121f', campoTesto: '#f5f3ff',
      },
      tipografia: { font: 'Poppins', fontTitoli: null, dimensioneTitoloPx: 22, dimensioneTestoPx: 14 },
      stile: { borderRadiusPx: 10, stilePulsanti: 'pieno', altezzaPulsantePx: 46, spaziaturaPx: 16, ombre: false, mostraBordi: true, larghezzaPx: 420 },
    },
  },
  {
    nome: 'Chiaro',
    descrizione: 'Fondo chiaro, blu, angoli morbidi: va bene con quasi tutti i siti.',
    parti: {
      colori: {
        sfondo: '#f4f6fa', superficie: '#ffffff', testoPrincipale: '#1f2430', testoSecondario: '#6b7280', bordi: '#e3e5ea',
        cta: '#2563eb', testoCta: '#ffffff', ctaSecondaria: '#eef1f6', testoCtaSecondaria: '#1f2430', accento: '#2563eb',
        campoSfondo: '#ffffff', campoTesto: '#1f2430',
      },
      tipografia: { font: 'Inter', fontTitoli: null, dimensioneTitoloPx: 22, dimensioneTestoPx: 14 },
      stile: { borderRadiusPx: 14, stilePulsanti: 'pieno', altezzaPulsantePx: 46, spaziaturaPx: 18, ombre: true, mostraBordi: true, larghezzaPx: 440 },
    },
  },
  {
    nome: 'Elegante',
    descrizione: 'Scuro con oro e titoli con le grazie, per teatri e serate.',
    parti: {
      colori: {
        sfondo: '#0d0f14', superficie: '#161a22', testoPrincipale: '#f2f4f8', testoSecondario: '#9aa3b2', bordi: '#232833',
        cta: '#d4af37', testoCta: '#14121f', ctaSecondaria: '#161a22', testoCtaSecondaria: '#f2f4f8', accento: '#d4af37',
        campoSfondo: '#0d0f14', campoTesto: '#f2f4f8',
      },
      tipografia: { font: 'Inter', fontTitoli: 'Playfair Display', dimensioneTitoloPx: 26, dimensioneTestoPx: 14 },
      stile: { borderRadiusPx: 4, stilePulsanti: 'pieno', altezzaPulsantePx: 48, spaziaturaPx: 20, ombre: false, mostraBordi: true, larghezzaPx: 440 },
    },
  },
  {
    nome: 'Caldo',
    descrizione: 'Fondo panna e arancio, pulsanti a pillola.',
    parti: {
      colori: {
        sfondo: '#fff8f2', superficie: '#ffffff', testoPrincipale: '#26160c', testoSecondario: '#7a6a5f', bordi: '#f0dfd2',
        cta: '#ff6b35', testoCta: '#ffffff', ctaSecondaria: '#fdeee4', testoCtaSecondaria: '#26160c', accento: '#ff6b35',
        campoSfondo: '#ffffff', campoTesto: '#26160c',
      },
      tipografia: { font: 'Nunito', fontTitoli: null, dimensioneTitoloPx: 24, dimensioneTestoPx: 15 },
      stile: { borderRadiusPx: 18, stilePulsanti: 'arrotondato', altezzaPulsantePx: 48, spaziaturaPx: 18, ombre: true, mostraBordi: false, larghezzaPx: 440 },
    },
  },
  {
    nome: 'Essenziale',
    descrizione: 'Bianco e nero, angoli vivi, niente ombre.',
    parti: {
      colori: {
        sfondo: '#ffffff', superficie: '#ffffff', testoPrincipale: '#111111', testoSecondario: '#666666', bordi: '#e5e5e5',
        cta: '#111111', testoCta: '#ffffff', ctaSecondaria: '#ffffff', testoCtaSecondaria: '#111111', accento: '#111111',
        campoSfondo: '#ffffff', campoTesto: '#111111',
      },
      tipografia: { font: 'Work Sans', fontTitoli: null, dimensioneTitoloPx: 22, dimensioneTestoPx: 14 },
      stile: { borderRadiusPx: 0, stilePulsanti: 'pieno', altezzaPulsantePx: 44, spaziaturaPx: 16, ombre: false, mostraBordi: true, larghezzaPx: 420 },
    },
  },
];
