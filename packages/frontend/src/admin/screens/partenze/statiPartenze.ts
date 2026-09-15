import type { eventiApi } from '../../../api/eventi';
import { eventoPassato, plurale } from '../../../shared/formato';
import { ETICHETTA_CAMBIO_PERCORSO } from '../../shared/AvvisoCambioPercorso';
import type { TabPartenze } from './tipi';

/** Lo stato di un tragitto in ogni voce di Partenze, in un posto solo: card
 *  dell'elenco, pagina del tragitto (etichetta, linguetta, bordo) e pallini
 *  del menu leggono tutti da qui. Regola del proprietario (settembre 2026):
 *  - rosso: tocca a noi fare qualcosa;
 *  - arancio: si aspetta qualcun altro (fornitori, prenotazioni);
 *  - verde: fatto;
 *  - viola, sopra tutti: percorso cambiato dopo il preventivo, da rifare.
 *  Il pallino di una voce conta gli eventi con almeno un tragitto rosso. */

export type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

export type Livello = 'da-fare' | 'attesa' | 'fatto' | 'percorso-cambiato';

export interface StatoTappa {
  livello: Livello;
  /** Vuoto: niente etichetta da mostrare (per esempio in Confermate quando è tutto a posto). */
  testo: string;
}

/** I dati di un tragitto che servono a decidere lo stato. */
export type DatiStatoTragitto = Pick<Partenza,
  'stato' | 'fermateCompilate' | 'fornitoreId' | 'preventivoCosto' | 'cambioPercorso'
  | 'richiestePreventivo' | 'rispostePreventivo' | 'lineeDaConfermare' | 'senzaPosto'
  | 'proposteSenzaRichieste' | 'risposteBus'>;

export const COLORE_LIVELLO: Record<Livello, string> = {
  'da-fare': 'var(--pink)',
  attesa: 'var(--amber)',
  fatto: 'var(--green)',
  'percorso-cambiato': 'var(--viola)',
};

/** Classe dell'etichetta piena (badge) per ogni livello. */
export const CLASSE_BADGE_LIVELLO: Record<Livello, string> = {
  'da-fare': 'badge-stato-rosso',
  attesa: 'badge-stato-arancio',
  fatto: 'badge-stato-verde',
  'percorso-cambiato': 'badge-stato-viola',
};

/** Classe della linguetta di un tragitto nella pagina dell'evento. */
export const CLASSE_LINGUETTA_LIVELLO: Record<Livello, string> = {
  'da-fare': 'attenzione',
  attesa: 'in-attesa',
  fatto: 'completato',
  'percorso-cambiato': 'percorso-cambiato',
};

/** Passeggeri che resterebbero senza posto con i bus confermati (calcolato dal
 *  server come lo smistamento: gruppi interi, solo sulle linee che si fermano
 *  alla loro fermata; non passeggeri meno posti). */
function mancanoPosti(t: DatiStatoTragitto) {
  return t.stato === 'CONFERMATO' ? t.senzaPosto : 0;
}

/** In quali voci compare un tragitto, tutte insieme: un compito fatto in una
 *  voce non lo toglie dalle altre, resta raggiungibile per rivederlo. */
export function tappeDi(p: Partenza): TabPartenze[] {
  if (eventoPassato(p.evento.data)) return ['passate'];
  // Preventivi solo con gli orari (la richiesta al fornitore li mostra),
  // Prezzi solo con un preventivo (i prezzi si calcolano da un costo noto).
  const conPreventivi: TabPartenze[] = p.fermateCompilate ? ['preventivi'] : [];
  const conPrezzi: TabPartenze[] = p.preventivoCosto ? ['da-prezzare'] : [];
  if (p.stato === 'DA_CONFERMARE') return ['fermate', ...conPreventivi, ...conPrezzi];
  const tappe: TabPartenze[] = ['fermate', ...conPreventivi, ...conPrezzi, 'da-confermare'];
  // "Confermate" è un insieme a parte: solo chi ha avuto almeno un bus vero.
  if (p.stato === 'CONFERMATO') tappe.push('confermato');
  return tappe;
}

/** Lo stato di un tragitto in una voce; null in Passate (solo archivio). */
export function statoInTappa(t: DatiStatoTragitto, tab: TabPartenze): StatoTappa | null {
  switch (tab) {
    case 'fermate':
      return t.fermateCompilate ? { livello: 'fatto', testo: 'Orari impostati' } : { livello: 'da-fare', testo: 'Orari da impostare' };
    case 'preventivi':
      // Voce "Quotazione": il prezzo indicativo di un bus per fare i prezzi.
      if (t.cambioPercorso) return { livello: 'percorso-cambiato', testo: ETICHETTA_CAMBIO_PERCORSO[t.cambioPercorso] };
      if (t.fornitoreId) return { livello: 'fatto', testo: 'Scelta' };
      if (t.preventivoCosto) return { livello: 'fatto', testo: 'Registrata' };
      // I fornitori hanno risposto: tocca a noi scegliere.
      if (t.rispostePreventivo > 0) return { livello: 'da-fare', testo: plurale(t.rispostePreventivo, 'risposta da valutare', 'risposte da valutare') };
      if (t.richiestePreventivo > 0) return { livello: 'attesa', testo: 'Richieste inviate' };
      return { livello: 'da-fare', testo: 'Da richiedere' };
    case 'da-prezzare':
      return t.stato !== 'DA_CONFERMARE' ? { livello: 'fatto', testo: 'In vendita' } : { livello: 'da-fare', testo: 'Da prezzare' };
    case 'da-confermare':
    case 'confermato': {
      if (t.stato === 'DA_CONFERMARE') return { livello: 'da-fare', testo: 'Da prezzare' };
      // Proposte da confermare: si chiedono i preventivi per i bus, si sceglie, si conferma.
      if (t.lineeDaConfermare > 0) {
        if (t.risposteBus > 0) return { livello: 'da-fare', testo: plurale(t.risposteBus, 'preventivo bus da valutare', 'preventivi bus da valutare') };
        if (t.proposteSenzaRichieste > 0) return { livello: 'da-fare', testo: t.proposteSenzaRichieste === 1 ? 'Bus da richiedere' : `${t.proposteSenzaRichieste} bus da richiedere` };
        return { livello: 'attesa', testo: 'Preventivi bus inviati' };
      }
      const mancanti = mancanoPosti(t);
      if (mancanti > 0) return { livello: 'da-fare', testo: `${mancanti} senza posto` };
      if (t.stato === 'CONFERMATO') return { livello: 'fatto', testo: tab === 'confermato' ? '' : 'Confermata' };
      // In vendita senza bus: si aspettano le prenotazioni per arrivare al pareggio.
      return { livello: 'attesa', testo: 'Sotto il pareggio' };
    }
    default:
      return null;
  }
}

/** Lo stato di un tragitto fuori da una voce precisa (scheda dell'evento in Eventi). */
export function statoGenerale(t: DatiStatoTragitto): StatoTappa {
  if (t.stato === 'DA_CONFERMARE') return { livello: 'da-fare', testo: 'Da prezzare, non ancora in vendita' };
  return statoInTappa(t, 'da-confermare')!;
}

/** Il colore di una card con più tragitti è quello del tragitto messo peggio. */
const GRAVITA: Record<Livello, number> = { 'percorso-cambiato': 3, 'da-fare': 2, attesa: 1, fatto: 0 };

export function livelloPeggiore(stati: StatoTappa[]): Livello | null {
  return stati.reduce<Livello | null>((peggiore, s) => (peggiore === null || GRAVITA[s.livello] > GRAVITA[peggiore] ? s.livello : peggiore), null);
}

/** Colore ed etichetta della card di un evento in una voce. */
export function statoCard(stati: StatoTappa[]): { livello: Livello | null; testo?: string } {
  const livello = livelloPeggiore(stati);
  if (livello === null) return { livello: null };
  if (stati.every((s) => !s.testo)) return { livello };
  const conQuestoLivello = stati.filter((s) => s.livello === livello);
  const etichette = [...new Set(conQuestoLivello.map((s) => s.testo).filter(Boolean))];
  // Tutti i tragitti nello stesso stato: la loro etichetta (o quante sono).
  if (conQuestoLivello.length === stati.length) {
    if (etichette.length === 1) return { livello, testo: etichette[0] };
    return { livello, testo: livello === 'fatto' ? 'Fatto' : livello === 'attesa' ? 'In attesa' : `${stati.length} da completare` };
  }
  // Stati diversi: quanti sono già a posto.
  const fatti = stati.filter((s) => s.livello === 'fatto').length;
  if (livello === 'percorso-cambiato') return { livello, testo: etichette.length === 1 ? etichette[0] : `${conQuestoLivello.length} percorsi cambiati` };
  return { livello, testo: `${fatti}/${stati.length} pronti` };
}

/** Le voci di Partenze che hanno un pallino nel menu. */
export type VocePallino = Exclude<TabPartenze, 'passate'>;

/** Pallini del menu: per ogni voce gli eventi con almeno un tragitto rosso;
 *  a parte, in viola, gli eventi con un percorso cambiato (su Preventivi). */
export function palliniPartenze(partenze: Partenza[]): { perVoce: Record<VocePallino, number>; percorsiCambiati: number } {
  const eventiPerVoce: Record<VocePallino, Set<string>> = {
    fermate: new Set(), preventivi: new Set(), 'da-prezzare': new Set(), 'da-confermare': new Set(), confermato: new Set(),
  };
  const conPercorsoCambiato = new Set<string>();
  for (const p of partenze) {
    for (const tab of tappeDi(p)) {
      if (tab === 'passate') continue;
      const stato = statoInTappa(p, tab);
      if (stato?.livello === 'da-fare') eventiPerVoce[tab].add(p.evento.id);
      if (stato?.livello === 'percorso-cambiato') conPercorsoCambiato.add(p.evento.id);
    }
  }
  return {
    perVoce: {
      fermate: eventiPerVoce.fermate.size,
      preventivi: eventiPerVoce.preventivi.size,
      'da-prezzare': eventiPerVoce['da-prezzare'].size,
      'da-confermare': eventiPerVoce['da-confermare'].size,
      confermato: eventiPerVoce.confermato.size,
    },
    percorsiCambiati: conPercorsoCambiato.size,
  };
}

/** Cosa c'è da fare in una voce, per il suggerimento sul pallino. */
export const COSA_DA_FARE: Record<VocePallino, string> = {
  fermate: 'orari da impostare',
  preventivi: 'quotazioni da richiedere o risposte da valutare',
  'da-prezzare': 'prezzi da salvare',
  'da-confermare': 'bus da richiedere, preventivi da valutare o passeggeri senza posto',
  confermato: 'bus da richiedere, preventivi da valutare o passeggeri senza posto',
};
