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
}

interface CarrelloContesto {
  articoli: ArticoloCarrello[];
  aggiungi: (articolo: Omit<ArticoloCarrello, 'id'>) => void;
  rimuovi: (id: string) => void;
  aggiornaPasseggeri: (id: string, passeggeri: number) => void;
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
    setArticoli((prev) => {
      const esistente = prev.find((a) => a.eventoId === articolo.eventoId && a.fermataId === articolo.fermataId);
      if (esistente) {
        return prev.map((a) => a.id === esistente.id ? { ...a, passeggeri: a.passeggeri + articolo.passeggeri } : a);
      }
      return [...prev, { ...articolo, id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }];
    });
  }
  function rimuovi(id: string) {
    setArticoli((prev) => prev.filter((a) => a.id !== id));
  }
  function aggiornaPasseggeri(id: string, passeggeri: number) {
    setArticoli((prev) => prev.map((a) => a.id === id ? { ...a, passeggeri: Math.max(1, passeggeri) } : a));
  }
  function svuota() {
    setArticoli([]);
  }

  const numeroArticoli = articoli.reduce((s, a) => s + a.passeggeri, 0);
  const totaleStimato = articoli.reduce((s, a) => s + a.prezzoStimato * a.passeggeri, 0);

  return (
    <Contesto.Provider value={{ articoli, aggiungi, rimuovi, aggiornaPasseggeri, svuota, numeroArticoli, totaleStimato }}>
      {children}
    </Contesto.Provider>
  );
}

export function useCarrello() {
  const ctx = useContext(Contesto);
  if (!ctx) throw new Error('useCarrello va usato dentro <CarrelloProvider>');
  return ctx;
}
