/**
 * Tipo del tema White Label — un unico posto dove vivono TUTTE le
 * proprietà grafiche personalizzabili, così il widget e l'editor
 * admin leggono esattamente la stessa struttura, senza ambiguità.
 *
 * Se in futuro serve un nuovo layout o una nuova proprietà grafica:
 * si aggiunge qui, si aggiorna DEFAULT_WHITE_LABEL_THEME con un
 * default sicuro, e sia editor che widget la vedono subito — senza
 * toccare validazione o business logic altrove.
 */

export type PosizioneLogo = 'in-alto-a-sinistra' | 'in-alto-al-centro' | 'in-alto-a-destra';
export type TipoLayout = 'card' | 'hero' | 'horizontal';
export type StilePulsanti = 'pieno' | 'contorno' | 'arrotondato';

export interface WhiteLabelTheme {
  branding: {
    logoUrl: string | null;
    logoMobileUrl: string | null;
    immaginePrincipaleUrl: string | null;
    heroImageUrl: string | null;
    posizioneLogo: PosizioneLogo;
    dimensioneLogoPx: number;
  };
  colori: {
    sfondo: string;
    superficie: string;
    testoPrincipale: string;
    testoSecondario: string;
    cta: string;
    testoCta: string;
    bordi: string;
  };
  tipografia: {
    font: string;
    dimensioneTitoloPx: number;
    dimensioneTestoPx: number;
  };
  stile: {
    borderRadiusPx: number;
    stilePulsanti: StilePulsanti;
    altezzaPulsantePx: number;
    spaziaturaPx: number;
  };
  layout: {
    tipo: TipoLayout;
  };
  elementiVisibili: {
    logo: boolean;
    immagine: boolean;
    titolo: boolean;
    data: boolean;
    percorso: boolean;
    fermate: boolean;
    prezzo: boolean;
    disponibilita: boolean;
    descrizione: boolean;
    cta: boolean;
    informazioni: boolean;
  };
}

export const DEFAULT_WHITE_LABEL_THEME: WhiteLabelTheme = {
  branding: {
    logoUrl: null,
    logoMobileUrl: null,
    immaginePrincipaleUrl: null,
    heroImageUrl: null,
    posizioneLogo: 'in-alto-a-sinistra',
    dimensioneLogoPx: 32,
  },
  colori: {
    sfondo: '#14121f',
    superficie: '#1f1c2e',
    testoPrincipale: '#f5f3ff',
    testoSecondario: '#a99fc2',
    cta: '#ff2d78',
    testoCta: '#ffffff',
    bordi: '#2c2740',
  },
  tipografia: {
    font: 'Poppins',
    dimensioneTitoloPx: 22,
    dimensioneTestoPx: 14,
  },
  stile: {
    borderRadiusPx: 10,
    stilePulsanti: 'pieno',
    altezzaPulsantePx: 46,
    spaziaturaPx: 16,
  },
  layout: {
    tipo: 'card',
  },
  elementiVisibili: {
    logo: true,
    immagine: true,
    titolo: true,
    data: true,
    percorso: true,
    fermate: true,
    prezzo: true,
    disponibilita: true,
    descrizione: true,
    cta: true,
    informazioni: true,
  },
};

/** Unisce un tema salvato (magari parziale/vecchio) col default, così
 *  ogni proprietà mancante prende il valore sicuro invece di lasciare
 *  undefined in giro. */
export function normalizzaTema(temaSalvato: unknown): WhiteLabelTheme {
  const t = (temaSalvato && typeof temaSalvato === 'object' ? temaSalvato : {}) as Partial<WhiteLabelTheme>;
  return {
    branding: { ...DEFAULT_WHITE_LABEL_THEME.branding, ...t.branding },
    colori: { ...DEFAULT_WHITE_LABEL_THEME.colori, ...t.colori },
    tipografia: { ...DEFAULT_WHITE_LABEL_THEME.tipografia, ...t.tipografia },
    stile: { ...DEFAULT_WHITE_LABEL_THEME.stile, ...t.stile },
    layout: { ...DEFAULT_WHITE_LABEL_THEME.layout, ...t.layout },
    elementiVisibili: { ...DEFAULT_WHITE_LABEL_THEME.elementiVisibili, ...t.elementiVisibili },
  };
}
