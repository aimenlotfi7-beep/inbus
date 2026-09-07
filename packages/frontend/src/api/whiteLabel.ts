import { api, apiConToken } from './client';
import type { BundlePubblicoDettaglio } from './bundle';
import type { OpzionePartenza } from './types';

const apiClienteConToken = apiConToken('inbus_cliente_token');

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

export interface WhiteLabel {
  id: string;
  organizzatoreId: string;
  eventoId: string | null;
  bundleId: string | null;
  publicWidgetId: string;
  attiva: boolean;
  dominiAutorizzati: string[];
  tema: WhiteLabelTheme;
  layoutBigliettoId: string | null;
  organizzatoreNome: string;
  eventoArtista: string | null;
  bundleNome: string | null;
}
export interface WhiteLabelInput {
  organizzatoreId: string;
  eventoId?: string;
  bundleId?: string;
  attiva?: boolean;
  dominiAutorizzati?: string[];
  tema?: Partial<WhiteLabelTheme>;
  layoutBigliettoId?: string | null;
}

export interface WhiteLabelPubblica {
  attiva: boolean;
  tema: WhiteLabelTheme;
  dominiAutorizzati: string[];
  evento: { id: string; slug: string; artista: string; data: string; luogo: string; citta: string; descrizione: string | null } | null;
  bundle: BundlePubblicoDettaglio | null;
}

export interface PrenotazioneCreata {
  id: string;
  pnr: string;
}

export const whiteLabelApi = {
  getPubblica: (publicWidgetId: string) => api.get<WhiteLabelPubblica>(`/api/public/widget/${publicWidgetId}`),
  opzioniPartenza: (publicWidgetId: string, eventoId?: string, servizioId?: string) =>
    api.get<OpzionePartenza[]>(`/api/public/widget/${publicWidgetId}/opzioni-partenza${eventoId ? `?eventoId=${eventoId}${servizioId ? `&servizioId=${servizioId}` : ''}` : ''}`),
  ordineBundle: (publicWidgetId: string, articoli: Record<string, unknown>[]) =>
    apiClienteConToken.post<{ ordine: { id: string; totale: string }; prenotazioni: { pnr: string }[] }>(`/api/public/widget/${publicWidgetId}/ordine`, { articoli }),
  prenota: (publicWidgetId: string, input: Record<string, unknown>) =>
    apiClienteConToken.post<PrenotazioneCreata>(`/api/public/widget/${publicWidgetId}/prenota`, input),
  list: () => api.get<WhiteLabel[]>('/api/admin/white-label'),
  getById: (id: string) => api.get<WhiteLabel>(`/api/admin/white-label/${id}`),
  create: (input: WhiteLabelInput) => api.post<WhiteLabel>('/api/admin/white-label', input),
  update: (id: string, input: Partial<WhiteLabelInput>) => api.put<WhiteLabel>(`/api/admin/white-label/${id}`, input),
  rigeneraWidgetId: (id: string) => api.post<WhiteLabel>(`/api/admin/white-label/${id}/rigenera-widget-id`, {}),
  remove: (id: string) => api.delete<void>(`/api/admin/white-label/${id}`),
};
