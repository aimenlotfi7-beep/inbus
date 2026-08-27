import { InfoTooltip } from './InfoTooltip';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';

/** L'intestazione di un campo, col tooltip SEMPRE di fianco al testo,
 *  mai a capo — dentro una label a colonna (flex-direction:column),
 *  testo+tooltip devono stare uniti nello stesso elemento inline,
 *  altrimenti diventano due "righe" della colonna a sé stanti, una
 *  sopra l'altra invece che fianco a fianco (era proprio questo il
 *  bug: ogni figlio diretto della label diventava una riga propria).
 *
 *  Il testo del tooltip arriva da "mappaTooltip" (i contenuti
 *  personalizzati, se l'admin ne ha modificato qualcuno dalla sezione
 *  Sistema) — se non è mai stato personalizzato, usa il default. */
export function EtichettaTooltip({ testo, chiave, mappaTooltip }: { testo: string; chiave: string; mappaTooltip: Record<string, string> }) {
  const testoTooltip = mappaTooltip[chiave] ?? TOOLTIP_DEFAULT[chiave];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {testo}
      {testoTooltip && <InfoTooltip>{testoTooltip}</InfoTooltip>}
    </span>
  );
}
