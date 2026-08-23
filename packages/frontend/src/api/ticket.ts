const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface Biglietto {
  nome: string;
  cognome: string;
  token: string;
}

export const ticketApi = {
  lista: async (pnr: string, email: string): Promise<Biglietto[]> => {
    const r = await fetch(`${API_URL}/api/biglietti/${pnr}/lista?email=${encodeURIComponent(email)}`);
    if (!r.ok) return [];
    return r.json();
  },
  urlDownload: (token: string) => `${API_URL}/api/biglietti/scarica/${token}`,
};
