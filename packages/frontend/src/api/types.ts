export interface Fermata {
  id: string;
  citta: string;
  indirizzo: string;
  orario: string | null;
  orarioRitorno: string | null;
  indirizzoRitorno: string | null;
  prezzo: string | null;
}

export interface LineaBus {
  id: string;
  nome: string;
  postiTotali: number;
  postiDisponibili: number;
  prezzoExtra: string;
  referenteNome: string | null;
  referenteTelefono: string | null;
  arrivoIndirizzo: string | null;
  arrivoOrario: string | null;
  fermate: Fermata[];
}

export interface Evento {
  id: string;
  artista: string;
  genere: string;
  luogo: string;
  citta: string;
  data: string;
  prezzo: string | null;
  inEvidenza: boolean;
  ordineEvidenza: number;
  accontoEur: string | null;
  statoDisponibilita: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null;
  linee: LineaBus[];
  immagini: { id: string; url: string; ordine: number }[];
  allegati: { id: string; nome: string; url: string }[];
}

export interface OpzionePartenza {
  lineaId: string;
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
  lineaId: string;
  fermataCitta: string;
  fermataOrario: string | null;
  passeggeri: number;
  totale: string;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  saldoPagato: boolean;
  scadenzaSaldo: string | null;
  stato: 'CONFERMATA' | 'CANCELLATA';
  creataIl: string;
}
