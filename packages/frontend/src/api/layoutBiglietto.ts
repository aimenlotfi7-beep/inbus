import { api } from './client';

export interface LayoutBiglietto {
  id: string;
  nome: string;
  predefinito: boolean;
  configurazione: string;
  creatoIl: string;
  aggiornatoIl: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const layoutBigliettoApi = {
  list: () => api.get<LayoutBiglietto[]>('/api/layout-biglietto'),
  crea: (input: { nome: string; configurazione: string }) => api.post<LayoutBiglietto>('/api/layout-biglietto', input),
  aggiorna: (id: string, input: { nome?: string; configurazione?: string }) => api.put<{ ok: true }>(`/api/layout-biglietto/${id}`, input),
  impostaPredefinito: (id: string) => api.post<{ ok: true }>(`/api/layout-biglietto/${id}/predefinito`),
  elimina: (id: string) => api.delete<{ ok: true }>(`/api/layout-biglietto/${id}`),

  /** Genera l'anteprima e la scarica subito — non passa dal client API
   *  normale perché la risposta è un PDF binario, non JSON. */
  async scaricaAnteprima(configurazione: string): Promise<void> {
    const token = localStorage.getItem('inbus_admin_token');
    const res = await fetch(`${API_URL}/api/layout-biglietto/anteprima`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ configurazione }),
    });
    if (!res.ok) {
      const risposta = await res.json().catch(() => ({ errore: res.statusText }));
      throw new Error(risposta.errore ?? 'Anteprima non riuscita');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
};
