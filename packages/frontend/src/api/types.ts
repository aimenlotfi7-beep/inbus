export interface Fermata {
  id: string;
  fermataAnagraficaId: string | null;
  citta: string;
  indirizzo: string;
  orario: string | null;
  orarioRitorno: string | null;
  indirizzoRitorno: string | null;
  prezzo: string | null;
  postiMax: number | null;
  postiPrenotati: number;
}

export interface Tragitto {
  id: string;
  servizioId: string | null;
  nome: string;
  postiTotali: number;
  postiDisponibili: number;
  prezzoExtra: string;
  attivo: boolean;
  stato: 'DA_CONFERMARE' | 'CONFERMATO';
  referenteNome: string | null;
  referenteTelefono: string | null;
  fermate: Fermata[];
}

export interface Servizio {
  id: string;
  eventoId: string;
  nome: string;
  arrivoIndirizzo: string | null;
  arrivoOrario: string | null;
  ordine: number;
  tragitti: Tragitto[];
}

export interface Evento {
  id: string;
  artista: string;
  genere: string;
  categoria: string | null;
  luogo: string;
  citta: string;
  data: string;
  prezzo: string | null;
  inEvidenza: boolean;
  ordineEvidenza: number;
  accontoEur: string | null;
  statoDisponibilita: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null;
  arrivoIndirizzo: string | null;
  arrivoOrario: string | null;
  visibileSito: boolean;
  bozza: boolean;
  descrizione: string | null;
  descrizioneSeo: string | null;
  ticketColoreAccento: string | null;
  ticketImmagineSfondoUrl: string | null;
  layoutBigliettoId: string | null;
  slug: string;
  tragitti: Tragitto[];
  servizi: Servizio[];
  immagini: { id: string; url: string; ordine: number }[];
  allegati: { id: string; nome: string; url: string }[];
}

export interface OpzionePartenza {
  tragittoId: string;
  postiDisponibili: number;
  fermataId: string;
  fermataCitta: string;
  fermataIndirizzo: string;
  fermataOrario: string | null;
  orarioRitorno: string | null;
  indirizzoRitorno: string | null;
  prezzoEffettivo: number;
}

export interface Prenotazione {
  id: string;
  pnr: string;
  eventoId: string;
  tragittoId: string;
  fermataCitta: string;
  fermataIndirizzo: string | null;
  fermataOrario: string | null;
  passeggeri: number;
  totale: string;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  saldoPagato: boolean;
  scadenzaSaldo: string | null;
  stato: 'CONFERMATA' | 'CANCELLATA';
  creataIl: string;
}
