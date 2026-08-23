export type ChiaveStatoPrenotazione = 'cancellata' | 'confermata' | 'acconto_attesa' | 'acconto_scaduto';

export interface StatoPrenotazioneInfo {
  chiave: ChiaveStatoPrenotazione;
  etichetta: string;
  classe: 'confermata' | 'cancellata' | 'attenzione' | 'scaduto';
}

/** Calcola lo stato visivo vero di una prenotazione dai dati reali —
 *  non solo "confermata/cancellata": distingue anche se il saldo è
 *  ancora nei termini o è scaduto (data reale confrontata con oggi),
 *  cosa che prima non veniva mai segnalata a parte. */
export function calcolaStatoPrenotazione(p: {
  stato: 'CONFERMATA' | 'CANCELLATA';
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  saldoPagato: boolean;
  scadenzaSaldo: string | null;
}): StatoPrenotazioneInfo {
  if (p.stato === 'CANCELLATA') {
    return { chiave: 'cancellata', etichetta: 'Cancellata', classe: 'cancellata' };
  }
  if (p.tipoPagamento === 'COMPLETO' || p.saldoPagato) {
    return { chiave: 'confermata', etichetta: 'Confermata', classe: 'confermata' };
  }
  const scaduto = p.scadenzaSaldo ? new Date(p.scadenzaSaldo).getTime() < Date.now() : false;
  if (scaduto) {
    return { chiave: 'acconto_scaduto', etichetta: 'Saldo scaduto', classe: 'scaduto' };
  }
  return { chiave: 'acconto_attesa', etichetta: 'Saldo da versare', classe: 'attenzione' };
}
