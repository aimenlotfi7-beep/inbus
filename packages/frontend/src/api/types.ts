export interface Fermata {
  id: string;
  fermataAnagraficaId: string | null;
  citta: string;
  // Nullo solo per una fermata "Partenza" appena creata da un Percorso
  // Salvato applicato e non ancora invertito — l'indirizzo vero si
  // scrive qui in Eventi (la venue dipende dall'evento specifico).
  indirizzo: string | null;
  orario: string | null;
  orarioRitorno: string | null;
  indirizzoRitorno: string | null;
  prezzo: string | null;
  postiMax: number | null;
  postiPrenotati: number;
  sogliaMinima: number | null;
  attivo: boolean;
}

export interface Tragitto {
  id: string;
  servizioId: string | null;
  nome: string;
  postiTotali: number;
  postiDisponibili: number;
  prezzoExtra: string;
  attivo: boolean;
  stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO';
  // Il preventivo (dal fornitore, sullo scenario più caro) che ha
  // sbloccato lo stato "Prezzato" — resta sempre leggibile qui, non
  // sparisce una volta registrato: serve poterlo rivedere/modificare
  // in ogni momento, non solo la prima volta.
  preventivoCosto: string | null;
  // Deciso in Eventi, durante la creazione del tragitto — non più da
  // Partenze.
  arrivoIndirizzo: string | null;
  arrivoOrario: string | null;
  arrivoCitta: string | null;
  preventivoPostiBus: number | null;
  referenteNome: string | null;
  referenteTelefono: string | null;
  fermate: Fermata[];
}

export interface Servizio {
  id: string;
  eventoId: string;
  nome: string;
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
  sogliaMinima: number | null;
  partecipantiAttuali: number | null;
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
