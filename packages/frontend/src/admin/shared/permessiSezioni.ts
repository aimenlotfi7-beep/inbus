import type { SezioneGestionale } from './AdminLayout';
import { haPermesso, type SessioneAdmin } from '../../api/auth';

/** Sezioni che un collaboratore ("solo gli eventi assegnati") non vede:
 *  clienti e vendite li gestisce il team OnWay (proprietario, settembre
 *  2026; il server le chiude con nonPerCollaboratori), e le anagrafiche di
 *  fermate e tragitti salvati le può solo leggere dentro i suoi eventi. */
const SOLO_TEAM_ONWAY: ReadonlySet<SezioneGestionale> = new Set<SezioneGestionale>(['lista-attesa', 'comunicazioni', 'fermate', 'tragitti']);

/** Se la sessione può aprire una sezione: il suo permesso, e per "Il mio
 *  compenso" l'essere responsabile di almeno un evento. */
export function puoVedereSezione(sessione: SessioneAdmin | null, sezione: SezioneGestionale): boolean {
  if (sezione === 'mio-compenso') return (sessione?.eventiAssegnati ?? 0) > 0;
  if (sessione?.soloEventiAssegnati && SOLO_TEAM_ONWAY.has(sezione)) return false;
  return haPermesso(sessione, PERMESSO_SEZIONE[sezione]);
}

// Permesso richiesto per ogni sezione, usato per bloccare l'accesso
// diretto (non solo nascondere la voce di menu) se qualcuno perde un
// permesso mentre è già loggato. Le Statistiche lo usano anche per
// mostrare "Apri →" solo verso le sezioni che l'amministratore può vedere.
export const PERMESSO_SEZIONE: Record<SezioneGestionale, string> = {
  statistiche: 'statistiche.visualizza',
  eventi: 'eventi.visualizza',
  bundle: 'bundle.visualizza',
  tour: 'tour.visualizza',
  vetrina: 'eventi.vetrina',
  calendario: 'eventi.calendario',
  cestino: 'eventi.cestino',
  transazioni: 'prenotazioni.transazioni',
  pagamenti: 'prenotazioni.pagamenti',
  rimborsi: 'prenotazioni.pagamenti',
  variazioni: 'prenotazioni.pagamenti',
  utenti: 'utenti.visualizza',
  fornitori: 'fornitori.visualizza',
  fermate: 'tragitti.visualizza',
  tragitti: 'tragitti.visualizza',
  promoter: 'promoter.visualizza',
  organizzatori: 'organizzatori.visualizza',
  'white-label': 'white-label.visualizza',
  tourleader: 'tourleader.visualizza',
  coupon: 'coupon.visualizza',
  voucher: 'coupon.visualizza',
  campagne: 'campagne.gestisci',
  'lista-attesa': 'eventi.partenze',
  offerte: 'offerte.gestisci',
  chat: 'chat.visualizza',
  comunicazioni: 'eventi.crea',
  contenuti: 'pagine.gestisci',
  amministratori: 'utenze.gestisci',
  ruoli: 'permessi.gestisci',
  'testi-tooltip': 'impostazioni.gestisci',
  'partenze-orari': 'eventi.partenze',
  'partenze-preventivi': 'eventi.partenze',
  'partenze-prezzi': 'eventi.partenze',
  'partenze-da-confermare': 'eventi.partenze',
  'partenze-confermato': 'eventi.partenze',
  'partenze-passate': 'eventi.partenze',
  linee: 'eventi.partenze',
  impostazioni: 'impostazioni.gestisci',
  tracciamento: 'impostazioni.gestisci',
  'template-email': 'template-email.gestisci',
  'layout-biglietto': 'layout-biglietto.gestisci',
  'beta-tragitti-vicini': 'eventi.partenze',
  compensi: 'collaboratori.gestisci',
  // Nessun permesso: la vede chi è responsabile di eventi (puoVedereSezione).
  'mio-compenso': '',
};
