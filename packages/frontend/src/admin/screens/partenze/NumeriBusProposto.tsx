import { formattaEuro, plurale } from '../../../shared/formato';
import { giudizio, previsto, risultato, spesa, type NumeriBusProposto } from '../statistiche/contiBusInPiu';

/** I numeri per decidere un bus proposto, dentro la sua scheda (proprietario,
 *  ottobre 2026: «ogni bus con i suoi numeri accanto»). Gli stessi conti della
 *  tabella «Incasso e spesa dei bus» qui sotto, con le stesse scelte: quanto
 *  porta, incassa e costa se parte, e cosa succede se non parte. */
export function NumeriBusPropostoRiquadro({ numeri }: { numeri: NumeriBusProposto | null }) {
  if (!numeri) return null;
  const { voce, seNonParte } = numeri;
  const r = risultato(voce);
  const commissioni = voce.promoter + voce.whiteLabel;
  const fonte = voce.busSenzaCosto > 0
    ? 'costo del bus non ancora noto'
    : numeri.fonteCosto === 'preventivo'
      ? `bus ${formattaEuro(voce.costoBus)}, il più basso di ${plurale(numeri.preventivi, 'preventivo', 'preventivi')}`
      : numeri.fonteCosto === 'quotazione'
        ? `bus ${formattaEuro(voce.costoBus)} dalla quotazione: nessun preventivo ancora`
        : `bus ${formattaEuro(voce.costoBus)}, scritto a mano`;

  return (
    <div className="riepilogo-numeri numeri-bus-proposto">
      <div className="riepilogo-numero">
        <span>Porta</span><b>{voce.passeggeri} / {voce.posti}</b>
        <small>passeggeri sui posti previsti</small>
      </div>
      <div className="riepilogo-numero">
        <span>Incasso previsto</span><b>{formattaEuro(previsto(voce))}</b>
        <small>{voce.daIncassare > 0 ? `già incassati ${formattaEuro(voce.incasso)}` : 'tutto già incassato'}</small>
      </div>
      <div className="riepilogo-numero">
        <span>Spesa</span><b>{formattaEuro(spesa(voce))}</b>
        <small>{fonte}{commissioni > 0 ? ` + ${formattaEuro(commissioni)} di commissioni` : ''}</small>
      </div>
      <div className={`riepilogo-numero ${giudizio(r) === 'perdita' ? 'rosso' : giudizio(r) === 'guadagno' ? 'verde' : ''}`}>
        <span>Se parte</span><b>{r >= 0 ? '+' : '−'}{formattaEuro(Math.abs(r))}</b>
        <small>{giudizio(r) === 'guadagno' ? 'guadagno' : giudizio(r) === 'perdita' ? 'perdita' : 'pareggio'}</small>
      </div>
      <div className={`riepilogo-numero ${seNonParte.passeggeri > 0 ? 'rosso' : 'verde'}`}>
        <span>Se non parte</span><b>{seNonParte.passeggeri === 0 ? 'Nessuno' : `${seNonParte.passeggeri} a terra`}</b>
        <small>{seNonParte.passeggeri === 0 ? 'gli altri bus portano tutti' : `${formattaEuro(seNonParte.valore)} da rimborsare`}</small>
      </div>
    </div>
  );
}
