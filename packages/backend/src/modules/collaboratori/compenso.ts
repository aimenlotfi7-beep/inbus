/** Il compenso del responsabile operativo di un evento (proprietario,
 *  settembre 2026), scelto evento per evento:
 *  - FISSO: una cifra in euro;
 *  - PERCENTUALE_INCASSO: una percentuale del valore delle prenotazioni
 *    confermate (cancellazioni e rimborsi sono già fuori);
 *  - PERCENTUALE_MARGINE: una percentuale del margine dell'evento (incasso
 *    meno bus, commissioni dei promoter e quote White Label), e niente se
 *    l'evento è in perdita.
 *  Come per il resto delle Statistiche ci sono due cifre: "previsto" (un
 *  acconto conta già per il prezzo intero) e "a oggi" (su quanto è stato
 *  pagato davvero). A evento concluso quella che conta è "a oggi". Senza
 *  database: si prova da sola in compenso.test.ts. */

export const TIPI_COMPENSO = ['FISSO', 'PERCENTUALE_INCASSO', 'PERCENTUALE_MARGINE'] as const;
export type TipoCompenso = (typeof TIPI_COMPENSO)[number];

export interface RegolaCompenso {
  tipo: TipoCompenso;
  /** Euro per FISSO, percentuale (0-100) per gli altri. */
  valore: number;
}

/** I numeri dell'evento PRIMA di togliere il compenso. */
export interface BaseCompenso {
  incasso: number;
  incassato: number;
  margine: number;
  margineAOggi: number;
}

export interface Compenso {
  previsto: number;
  aOggi: number;
}

const euro = (n: number) => Math.round(n * 100) / 100;

export function calcolaCompenso(regola: RegolaCompenso, base: BaseCompenso): Compenso {
  const quota = regola.valore / 100;
  switch (regola.tipo) {
    case 'FISSO':
      return { previsto: euro(regola.valore), aOggi: euro(regola.valore) };
    case 'PERCENTUALE_INCASSO':
      return { previsto: euro(base.incasso * quota), aOggi: euro(base.incassato * quota) };
    case 'PERCENTUALE_MARGINE':
      return { previsto: euro(Math.max(0, base.margine) * quota), aOggi: euro(Math.max(0, base.margineAOggi) * quota) };
  }
}

/** "300,00 € fisso", "8% sull'incasso", "10% sul margine". */
export function descriviRegola(regola: RegolaCompenso): string {
  const numero = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  if (regola.tipo === 'FISSO') return `${numero(regola.valore)} € fisso`;
  return `${numero(regola.valore)}% ${regola.tipo === 'PERCENTUALE_INCASSO' ? "sull'incasso" : 'sul margine'}`;
}
