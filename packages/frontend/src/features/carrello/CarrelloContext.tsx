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

/** Se il carrello è l'acquisto di un bundle: quale, e le sue regole
 *  che il checkout deve rispettare a schermo (il server le ri-verifica
 *  comunque). Un carrello bundle si usa TUTTO insieme: togliere una
 *  riga o aggiungerne un'altra lo fa decadere (svuota il bundle). */
export interface BundleNelCarrello {
  id: string; nome: string; scontoPercentuale: number;
  ammetteOfferte: boolean; ammetteCredito: boolean; ammettePromoter: boolean; ammetteAcconto: boolean;
  /** Letto da ?promo= quando il cliente atterra sulla pagina del bundle
   *  — stesso meccanismo già usato dal checkout dell'evento singolo. */
  promoterCodice?: string;
  /** Letti da ?utm_source=&utm_medium=&utm_campaign=&utm_content= alla
   *  stessa maniera — senza questo, un acquisto bundle arrivato da una
   *  campagna a pagamento non veniva mai attribuito, perché il
   *  checkout singolo li legge dall'URL AL MOMENTO dell'invio, ma il
   *  bundle nel frattempo è passato per /carrello, un URL diverso. */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}

interface CarrelloContesto {
  articoli: ArticoloCarrello[];
  aggiungi: (articolo: Omit<ArticoloCarrello, 'id'>) => void;
  rimuovi: (id: string) => void;
  svuota: () => void;
  numeroArticoli: number;
  totaleStimato: number;
  bundle: BundleNelCarrello | null;
  /** Sostituisce il contenuto con le righe di un bundle. */
  impostaBundle: (bundle: BundleNelCarrello, articoli: Omit<ArticoloCarrello, 'id'>[]) => void;
  scontoBundleStimato: number;
}

const Contesto = createContext<CarrelloContesto | null>(null);
const CHIAVE_STORAGE = 'inbus_carrello';
const CHIAVE_BUNDLE = 'inbus_carrello_bundle';

export function CarrelloProvider({ children }: { children: ReactNode }) {
  const [articoli, setArticoli] = useState<ArticoloCarrello[]>(() => {
    try {
      const salvato = localStorage.getItem(CHIAVE_STORAGE);
      return salvato ? JSON.parse(salvato) : [];
    } catch {
      return [];
    }
  });

  const [bundle, setBundle] = useState<BundleNelCarrello | null>(() => {
    try { const s = localStorage.getItem(CHIAVE_BUNDLE); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  useEffect(() => {
    localStorage.setItem(CHIAVE_STORAGE, JSON.stringify(articoli));
  }, [articoli]);
  useEffect(() => {
    if (bundle) localStorage.setItem(CHIAVE_BUNDLE, JSON.stringify(bundle)); else localStorage.removeItem(CHIAVE_BUNDLE);
  }, [bundle]);

  const nuovoId = () => `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  function aggiungi(articolo: Omit<ArticoloCarrello, 'id'>) {
    setBundle(null); // un evento aggiunto a mano non fa parte del bundle: il bundle decade
    setArticoli((prev) => [...prev, { ...articolo, id: nuovoId() }]);
  }
  function rimuovi(id: string) {
    setBundle(null); // idem: un bundle si compra tutto insieme
    setArticoli((prev) => prev.filter((a) => a.id !== id));
  }
  function svuota() {
    setBundle(null);
    setArticoli([]);
  }
  function impostaBundle(b: BundleNelCarrello, righe: Omit<ArticoloCarrello, 'id'>[]) {
    setArticoli(righe.map((r) => ({ ...r, id: nuovoId() })));
    setBundle(b);
  }

  const numeroArticoli = articoli.reduce((s, a) => s + a.passeggeri, 0);
  const totaleStimato = articoli.reduce((s, a) => s + a.prezzoStimato * a.passeggeri, 0);
  // Stima a schermo: il server ricalcola e ripartisce per riga.
  const scontoBundleStimato = bundle ? Math.round(totaleStimato * bundle.scontoPercentuale) / 100 : 0;

  return (
    <Contesto.Provider value={{ articoli, aggiungi, rimuovi, svuota, numeroArticoli, totaleStimato, bundle, impostaBundle, scontoBundleStimato }}>
      {children}
    </Contesto.Provider>
  );
}

export function useCarrello() {
  const ctx = useContext(Contesto);
  if (!ctx) throw new Error('useCarrello va usato dentro <CarrelloProvider>');
  return ctx;
}
