// La matematica PURA del calcolo commissione — separata di proposito
// in un file a sé, senza NESSUN import di db/schema: anche se una
// funzione non tocca mai il database, importarla da un file che ne
// importa un'ALTRA che lo tocca fa comunque scattare quella
// connessione (gli import di un modulo si eseguono tutti insieme) —
// nei test, senza le variabili d'ambiente vere, quello manda in crash
// l'intero file di test anche se il test in sé non aveva bisogno di
// nessun database. La usano le Statistiche (statistiche/economia.ts,
// commissioniPer), e da lì anche area promoter, Campagne e Partenze.

interface CompensoCoupon {
  compensoTipo: 'PERCENTUALE' | 'FISSO' | null;
  compensoValore: string | number | null;
  compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null;
}

/** La regola del compenso del promoter fissata sulla prenotazione al
 *  momento della vendita (colonna prenotazioni.compenso_promoter, deciso
 *  dal proprietario a settembre 2026): la percentuale del promoter di
 *  allora e il compenso del coupon usato, se ne aveva uno. Cambiarli dopo
 *  non tocca le vendite già fatte. */
export interface RegolaCompensoPromoter extends CompensoCoupon {
  percentuale: number;
}

interface RigaPerCommissione {
  totale: number;
  passeggeri: number;
  couponCodice: string | null;
  /** L'ordine (carrello o bundle) della riga: il compenso fisso "per
   *  acquisto" conta una volta per ordine. Assente = la riga è un acquisto a sé. */
  ordineId?: string | null;
  /** La regola fissata alla vendita: se c'è vale lei, non il coupon e la
   *  percentuale di oggi (vendite di prima della colonna: assente). */
  regola?: RegolaCompensoPromoter | null;
}

/** Ogni riga usa il compenso del SUO coupon se ce l'ha (percentuale sul
 *  totale, o un importo fisso per acquisto o per passeggero),
 *  altrimenti il tasso di default dell'account del promoter; con la
 *  regola fissata alla vendita, quelli di allora.
 *  Arrotondato una sola volta, alla fine — non riga per riga, per non
 *  accumulare piccoli errori di arrotondamento su ordini con molte
 *  righe. */
export function calcolaCommissioneRighe(
  righe: RigaPerCommissione[],
  mappaCoupon: Map<string, CompensoCoupon>,
  defaultPercentuale: number,
  /** Da passare uguale a più chiamate (es. una per evento) perché lo stesso
   *  ordine non conti in ognuna. */
  acquistiContati: Set<string> = new Set(),
): number {
  let totale = 0;
  // Deciso dal proprietario: un coupon vale una volta per ordine, e così il
  // compenso fisso "per acquisto" (un carrello con due eventi è un acquisto).
  for (const r of righe) {
    const c = r.regola ?? (r.couponCodice ? mappaCoupon.get(r.couponCodice) : undefined);
    const percentuale = r.regola ? r.regola.percentuale : defaultPercentuale;
    if (c?.compensoTipo === 'FISSO' && c.compensoValore != null) {
      if (c.compensoFissoPer === 'PASSEGGERO') {
        totale += Number(c.compensoValore) * r.passeggeri;
      } else {
        const acquisto = r.ordineId ? `${r.ordineId} ${r.couponCodice}` : null;
        if (acquisto && acquistiContati.has(acquisto)) continue;
        if (acquisto) acquistiContati.add(acquisto);
        totale += Number(c.compensoValore);
      }
    } else if (c?.compensoTipo === 'PERCENTUALE' && c.compensoValore != null) {
      totale += r.totale * (Number(c.compensoValore) / 100);
    } else {
      totale += r.totale * (percentuale / 100);
    }
  }
  return Math.round(totale * 100) / 100;
}
