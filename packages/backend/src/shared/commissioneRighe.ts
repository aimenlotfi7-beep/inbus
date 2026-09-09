// La matematica PURA del calcolo commissione — separata di proposito
// in un file a sé, senza NESSUN import di db/schema: anche se una
// funzione non tocca mai il database, importarla da un file che ne
// importa un'ALTRA che lo tocca fa comunque scattare quella
// connessione (gli import di un modulo si eseguono tutti insieme) —
// nei test, senza le variabili d'ambiente vere, quello manda in crash
// l'intero file di test anche se il test in sé non aveva bisogno di
// nessun database. Vedi commissionePromoter.ts per la versione che
// legge davvero i coupon dal database e poi chiama questa.

interface RigaPerCommissione {
  totale: number;
  passeggeri: number;
  couponCodice: string | null;
}

interface CompensoCoupon {
  compensoTipo: 'PERCENTUALE' | 'FISSO' | null;
  compensoValore: string | null;
  compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null;
}

/** Ogni riga usa il compenso del SUO coupon se ce l'ha (percentuale sul
 *  totale, o un importo fisso per acquisto o per passeggero),
 *  altrimenti il tasso di default dell'account del promoter.
 *  Arrotondato una sola volta, alla fine — non riga per riga, per non
 *  accumulare piccoli errori di arrotondamento su ordini con molte
 *  righe. */
export function calcolaCommissioneRighe(righe: RigaPerCommissione[], mappaCoupon: Map<string, CompensoCoupon>, defaultPercentuale: number): number {
  let totale = 0;
  for (const r of righe) {
    const c = r.couponCodice ? mappaCoupon.get(r.couponCodice) : undefined;
    if (c?.compensoTipo === 'FISSO' && c.compensoValore != null) {
      totale += c.compensoFissoPer === 'PASSEGGERO' ? Number(c.compensoValore) * r.passeggeri : Number(c.compensoValore);
    } else if (c?.compensoTipo === 'PERCENTUALE' && c.compensoValore != null) {
      totale += r.totale * (Number(c.compensoValore) / 100);
    } else {
      totale += r.totale * (defaultPercentuale / 100);
    }
  }
  return Math.round(totale * 100) / 100;
}
