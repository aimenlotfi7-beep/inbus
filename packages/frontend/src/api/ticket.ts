const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface Biglietto {
  nome: string;
  cognome: string;
  token: string;
  /** ISO: da quando il PDF è scaricabile (24 ore prima della partenza, ora
   *  di Roma). null se non calcolabile. */
  disponibileDal: string | null;
  /** Riferimento (targa) del bus assegnato dallo smistamento; null finché
   *  non c'è. Il download funziona solo con disponibileDal passato E bus. */
  bus: string | null;
}

export const ticketApi = {
  lista: async (pnr: string, email: string): Promise<Biglietto[]> => {
    const r = await fetch(`${API_URL}/api/biglietti/${pnr}/lista?email=${encodeURIComponent(email)}`);
    if (!r.ok) return [];
    return r.json();
  },
  urlDownload: (token: string) => `${API_URL}/api/biglietti/scarica/${token}`,
};
