/**
 * Tipo del tema White Label — un unico posto dove vivono TUTTE le
 * proprietà grafiche personalizzabili, così il widget e l'editor
 * admin leggono esattamente la stessa struttura, senza ambiguità.
 *
 * Se in futuro serve un nuovo layout o una nuova proprietà grafica:
 * si aggiunge qui, si aggiorna DEFAULT_WHITE_LABEL_THEME con un
 * default sicuro, e sia editor che widget la vedono subito — senza
 * toccare validazione o business logic altrove. Il tema sta in un
 * jsonb: aggiungere proprietà non richiede migrazioni, e normalizzaTema
 * riempie da sola quelle che mancano nei temi salvati prima.
 *
 * Obiettivo deciso dal proprietario (settembre 2026): il cliente finale
 * non deve accorgersi di essere su una piattaforma di qualcun altro, e
 * l'aspetto lo decide INBUS dal gestionale, White Label per White Label.
 * La copia per il gestionale è in packages/frontend/src/api/whiteLabel.ts.
 */

export type PosizioneLogo = 'in-alto-a-sinistra' | 'in-alto-al-centro' | 'in-alto-a-destra';
export type TipoLayout = 'card' | 'hero' | 'horizontal';
export type StilePulsanti = 'pieno' | 'contorno' | 'arrotondato';
/** Come si comporta l'immagine di sfondo della pagina. */
export type ModoSfondo = 'copri' | 'affianca' | 'fisso';

export interface WhiteLabelTheme {
  branding: {
    logoUrl: string | null;
    logoMobileUrl: string | null;
    immaginePrincipaleUrl: string | null;
    heroImageUrl: string | null;
    posizioneLogo: PosizioneLogo;
    dimensioneLogoPx: number;
    /** Immagine di sfondo di tutta la pagina (solo link diretto e widget a pagina intera). */
    sfondoImmagineUrl: string | null;
    sfondoImmagineModo: ModoSfondo;
    /** Velo del colore di sfondo sopra l'immagine, 0-100: alza per rendere leggibile il testo. */
    sfondoVeloPercentuale: number;
    /** Icona della scheda del browser (solo link diretto). */
    faviconUrl: string | null;
    /** Titolo della scheda del browser (solo link diretto); vuoto = nome dell'evento. */
    titoloPagina: string | null;
  };
  colori: {
    sfondo: string;
    superficie: string;
    testoPrincipale: string;
    testoSecondario: string;
    cta: string;
    testoCta: string;
    bordi: string;
    /** Pulsante secondario ("Ho già un account", "Indietro"). */
    ctaSecondaria: string;
    testoCtaSecondaria: string;
    /** Prezzi e cose da far notare. */
    accento: string;
    /** Campi da compilare (email, password, nome…). */
    campoSfondo: string;
    campoTesto: string;
  };
  tipografia: {
    font: string;
    /** Font dei titoli; vuoto = lo stesso del testo. */
    fontTitoli: string | null;
    dimensioneTitoloPx: number;
    dimensioneTestoPx: number;
  };
  stile: {
    borderRadiusPx: number;
    stilePulsanti: StilePulsanti;
    altezzaPulsantePx: number;
    spaziaturaPx: number;
    /** Ombra sotto i riquadri. */
    ombre: boolean;
    /** Bordo attorno ai riquadri. */
    mostraBordi: boolean;
    /** Larghezza massima del contenuto nella pagina a schermo intero. */
    larghezzaPx: number;
  };
  layout: {
    tipo: TipoLayout;
  };
  /** Testi al posto di quelli di serie; vuoto = testo di serie. */
  testi: {
    titolo: string | null;
    sottotitolo: string | null;
    pulsante: string | null;
    piePagina: string | null;
    /** Titolo sopra le card, quando la White Label ha più eventi. */
    titoloElenco: string | null;
  };
  marchio: {
    /** Falso: nessun riferimento a OnWay nella pagina del cliente. */
    mostraOnWay: boolean;
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

/** I font pronti nell'editor (Google Fonts, più quello di sistema). Il
 *  campo resta libero: un font diverso si può sempre scrivere a mano. */
export const FONT_WHITE_LABEL = [
  'Poppins', 'Inter', 'Montserrat', 'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Raleway',
  'Work Sans', 'Space Grotesk', 'Oswald', 'Playfair Display', 'Merriweather', 'Di sistema',
] as const;

export const DEFAULT_WHITE_LABEL_THEME: WhiteLabelTheme = {
  branding: {
    logoUrl: null,
    logoMobileUrl: null,
    immaginePrincipaleUrl: null,
    heroImageUrl: null,
    posizioneLogo: 'in-alto-a-sinistra',
    dimensioneLogoPx: 32,
    sfondoImmagineUrl: null,
    sfondoImmagineModo: 'copri',
    sfondoVeloPercentuale: 40,
    faviconUrl: null,
    titoloPagina: null,
  },
  colori: {
    sfondo: '#14121f',
    superficie: '#1f1c2e',
    testoPrincipale: '#f5f3ff',
    testoSecondario: '#a99fc2',
    cta: '#ff2d78',
    testoCta: '#ffffff',
    bordi: '#2c2740',
    ctaSecondaria: '#1f1c2e',
    testoCtaSecondaria: '#f5f3ff',
    accento: '#ff2d78',
    campoSfondo: '#14121f',
    campoTesto: '#f5f3ff',
  },
  tipografia: {
    font: 'Poppins',
    fontTitoli: null,
    dimensioneTitoloPx: 22,
    dimensioneTestoPx: 14,
  },
  stile: {
    borderRadiusPx: 10,
    stilePulsanti: 'pieno',
    altezzaPulsantePx: 46,
    spaziaturaPx: 16,
    ombre: false,
    mostraBordi: true,
    larghezzaPx: 420,
  },
  layout: {
    tipo: 'card',
  },
  testi: {
    titolo: null,
    sottotitolo: null,
    pulsante: null,
    piePagina: null,
    titoloElenco: null,
  },
  marchio: {
    mostraOnWay: true,
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
    testi: { ...DEFAULT_WHITE_LABEL_THEME.testi, ...t.testi },
    marchio: { ...DEFAULT_WHITE_LABEL_THEME.marchio, ...t.marchio },
    elementiVisibili: { ...DEFAULT_WHITE_LABEL_THEME.elementiVisibili, ...t.elementiVisibili },
  };
}
