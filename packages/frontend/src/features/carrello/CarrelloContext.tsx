import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ArticoloCarrello {
  id: string;
  eventoId: string;
  eventoArtista: string;
  eventoData: string;
  tragittoId: string;
  fermataId: string;
  fermataCitta: string;
  fermataOrario: string | null;
  prezzoStimato: number;
  passeggeri: number;
  offertaId?: string;
  // Raccolti nella tab di prenotazione (step "I tuoi dati") — arrivano
  // già completi al carrello, non si richiedono di nuovo lì.
  cliente: { email: string; nome: string; cognome: string; telefono: string };
  partecipanti: { nome: string; cognome: string }[];
}

interface CarrelloContesto {
  articoli: ArticoloCarrello[];
  aggiungi: (articolo: Omit<ArticoloCarrello, 'id'>) => void;
  rimuovi: (id: string) => void;
  svuota: () => void;
  numeroArticoli: number;
  totaleStimato: number;
}

const Contesto = createContext<CarrelloContesto | null>(null);
const CHIAVE_STORAGE = 'inbus_carrello';

export function CarrelloProvider({ children }: { children: ReactNode }) {
  const [articoli, setArticoli] = useState<ArticoloCarrello[]>(() => {
    try {
      const salvato = localStorage.getItem(CHIAVE_STORAGE);
      return salvato ? JSON.parse(salvato) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CHIAVE_STORAGE, JSON.stringify(articoli));
  }, [articoli]);

  function aggiungi(articolo: Omit<ArticoloCarrello, 'id'>) {
    setArticoli((prev) => [...prev, { ...articolo, id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
  }
  function rimuovi(id: string) {
    setArticoli((prev) => prev.filter((a) => a.id !== id));
  }
  function svuota() {
    setArticoli([]);
  }

  const numeroArticoli = articoli.reduce((s, a) => s + a.passeggeri, 0);
  const totaleStimato = articoli.reduce((s, a) => s + a.prezzoStimato * a.passeggeri, 0);

  return (
    <Contesto.Provider value={{ articoli, aggiungi, rimuovi, svuota, numeroArticoli, totaleStimato }}>
      {children}
    </Contesto.Provider>
  );
}

export function useCarrello() {
  const ctx = useContext(Contesto);
  if (!ctx) throw new Error('useCarrello va usato dentro <CarrelloProvider>');
  return ctx;
}
