import { api, apiConToken } from './client';
import type { BundlePubblicoDettaglio } from './bundle';
import type { Evento, OpzionePartenza } from './types';

const apiClienteConToken = apiConToken('inbus_cliente_token');

export type PosizioneLogo = 'in-alto-a-sinistra' | 'in-alto-al-centro' | 'in-alto-a-destra';
export type TipoLayout = 'card' | 'hero' | 'horizontal';
export type StilePulsanti = 'pieno' | 'contorno' | 'arrotondato';
/** Come si comporta l'immagine di sfondo della pagina. */
export type ModoSfondo = 'copri' | 'affianca' | 'fisso';

/** Copia identica di packages/backend/src/modules/white-label/white-label.theme.ts:
 *  tutte le proprietà grafiche personalizzabili di una White Label. */
export interface WhiteLabelTheme {
  branding: {
    logoUrl: string | null;
    logoMobileUrl: string | null;
    immaginePrincipaleUrl: string | null;
    heroImageUrl: string | null;
    posizioneLogo: PosizioneLogo;
    dimensioneLogoPx: number;
    /** Immagine di sfondo di tutta la pagina. */
    sfondoImmagineUrl: string | null;
    sfondoImmagineModo: ModoSfondo;
    /** Velo del colore di sfondo sopra l'immagine, 0-100. */
    sfondoVeloPercentuale: number;
    faviconUrl: string | null;
    /** Titolo della scheda del browser; vuoto = nome dell'evento. */
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
    ctaSecondaria: string;
    testoCtaSecondaria: string;
    /** Prezzi e cose da far notare. */
    accento: string;
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
    ombre: boolean;
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

/** I font pronti nell'editor (Google Fonts, più quello di sistema). */
export const FONT_WHITE_LABEL = [
  'Poppins', 'Inter', 'Montserrat', 'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Raleway',
  'Work Sans', 'Space Grotesk', 'Oswald', 'Playfair Display', 'Merriweather', 'Di sistema',
] as const;

/** Com'è oggi un evento dell'elenco di una White Label. */
export type StatoEventoWhiteLabel = 'in-vendita' | 'vendite-ferme' | 'passato' | 'bozza' | 'cestino';

/** Un evento in vendita su una White Label (elenco del gestionale). */
export interface EventoDellaWhiteLabel {
  id: string;
  slug: string;
  artista: string;
  citta: string;
  data: string;
  stato: StatoEventoWhiteLabel;
}

export interface WhiteLabel {
  id: string;
  organizzatoreId: string;
  bundleId: string | null;
  publicWidgetId: string;
  metaPixelId: string | null;
  metaCapiToken: string | null;
  attiva: boolean;
  dominiAutorizzati: string[];
  tema: WhiteLabelTheme;
  layoutBigliettoId: string | null;
  organizzatoreNome: string;
  bundleNome: string | null;
  /** Gli eventi in vendita (uno o più, dal più vicino); vuoto per un bundle. */
  eventi: EventoDellaWhiteLabel[];
}
export interface WhiteLabelInput {
  organizzatoreId: string;
  /** Uno o più eventi (altri si aggiungono dopo), oppure un bundle. */
  eventiIds?: string[];
  bundleId?: string;
  attiva?: boolean;
  dominiAutorizzati?: string[];
  tema?: Partial<WhiteLabelTheme>;
  layoutBigliettoId?: string | null;
  metaPixelId?: string | null;
  metaCapiToken?: string | null;
}

/** Un evento come card della pagina pubblica, con il prezzo vero. */
export interface CardEvento {
  id: string;
  slug: string;
  artista: string;
  data: string;
  luogo: string;
  citta: string;
  descrizione: string | null;
  immagineUrl: string | null;
  /** Il "da … €": la fermata più economica in vendita; null se non c'è un prezzo. */
  prezzoMinimo: number | null;
}

export interface WhiteLabelPubblica {
  attiva: boolean;
  tema: WhiteLabelTheme;
  dominiAutorizzati: string[];
  /** Pixel di Meta DI QUESTO organizzatore, se lo ha impostato — mai il token. */
  metaPixelId: string | null;
  /** L'evento da aprire subito: l'unico in vendita, o quello del link (?evento=). null = si sceglie dalle card. */
  evento: CardEvento | null;
  /** Gli eventi in vendita, dal più vicino (vuoto per un bundle). */
  eventi: CardEvento[];
  bundle: BundlePubblicoDettaglio | null;
}

export interface PrenotazioneCreata {
  id: string;
  pnr: string;
  totale: string;
  totaleComplessivo?: number;
}

export const whiteLabelApi = {
  // evento: lo slug di un evento solo (link o codice di quell'evento).
  getPubblica: (publicWidgetId: string, evento?: string | null) =>
    api.get<WhiteLabelPubblica>(`/api/public/widget/${publicWidgetId}${evento ? `?evento=${encodeURIComponent(evento)}` : ''}`),
  // L'evento completo per il checkout: anche se è nascosto dal sito OnWay.
  // Per un widget di bundle, l'evento del bundle indicato.
  evento: (publicWidgetId: string, eventoId?: string) =>
    api.get<Evento>(`/api/public/widget/${publicWidgetId}/evento${eventoId ? `?eventoId=${encodeURIComponent(eventoId)}` : ''}`),
  opzioniPartenza: (publicWidgetId: string, eventoId?: string, servizioId?: string) =>
    api.get<OpzionePartenza[]>(`/api/public/widget/${publicWidgetId}/opzioni-partenza${eventoId ? `?eventoId=${eventoId}${servizioId ? `&servizioId=${servizioId}` : ''}` : ''}`),
  ordineBundle: (publicWidgetId: string, articoli: Record<string, unknown>[]) =>
    apiClienteConToken.post<{ ordine: { id: string; totale: string }; prenotazioni: { pnr: string; totale: string; totaleComplessivo?: number }[] }>(`/api/public/widget/${publicWidgetId}/ordine`, { articoli }),
  prenota: (publicWidgetId: string, input: Record<string, unknown>) =>
    apiClienteConToken.post<PrenotazioneCreata>(`/api/public/widget/${publicWidgetId}/prenota`, input),
  list: () => api.get<WhiteLabel[]>('/api/admin/white-label'),
  getById: (id: string) => api.get<WhiteLabel>(`/api/admin/white-label/${id}`),
  create: (input: WhiteLabelInput) => api.post<WhiteLabel>('/api/admin/white-label', input),
  update: (id: string, input: Partial<WhiteLabelInput>) => api.put<WhiteLabel>(`/api/admin/white-label/${id}`, input),
  /** Sostituisce l'elenco degli eventi: link, codice e grafica restano gli stessi. */
  impostaEventi: (id: string, eventiIds: string[]) => api.put<WhiteLabel>(`/api/admin/white-label/${id}/eventi`, { eventiIds }),
  rigeneraWidgetId: (id: string) => api.post<WhiteLabel>(`/api/admin/white-label/${id}/rigenera-widget-id`, {}),
  remove: (id: string) => api.delete<void>(`/api/admin/white-label/${id}`),
};
