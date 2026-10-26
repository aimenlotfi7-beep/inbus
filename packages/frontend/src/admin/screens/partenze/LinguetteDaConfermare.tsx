import type { CalcoloBusTragitto, SuggerimentoLinea } from '../../../api/eventi';
import type { EventoSimulato } from '../../../api/statistiche';
import { formattaEuro } from '../../../shared/formato';
import { contiEvento, contiTragitto, risultato, type Scelte } from '../statistiche/contiBusInPiu';
import type { Livello, StatoTappa } from './statiPartenze';

/** «Da confermare», il quadro dell'evento dentro le linguette dei tragitti
 *  (proprietario, ottobre 2026: «una tabella con una riga per tragitto», ma
 *  di fianco e non sopra, perché con 30 tragitti una tabella in alto
 *  diventa una lista infinita). Ogni linguetta dice passeggeri, pareggio,
 *  risultato e cosa fare; in cima alla colonna il totale dell'evento e i
 *  filtri per vedere solo i tragitti da fare. Nessun conto nuovo: stati da
 *  statiPartenze.ts, contatore dal server, risultato dai conti di Bus in più. */

export type FiltroLinguette = 'tutti' | Exclude<Livello, 'percorso-cambiato'>;

const FILTRI: { valore: FiltroLinguette; etichetta: string }[] = [
  { valore: 'tutti', etichetta: 'Tutti' },
  { valore: 'da-fare', etichetta: 'Da fare' },
  { valore: 'attesa', etichetta: 'In attesa' },
  { valore: 'fatto', etichetta: 'A posto' },
];

/** Il tragitto passa il filtro? Il viola (percorso cambiato) conta come da fare. */
export function passaFiltro(stato: StatoTappa | null, filtro: FiltroLinguette): boolean {
  if (filtro === 'tutti') return true;
  const livello = stato?.livello === 'percorso-cambiato' ? 'da-fare' : stato?.livello;
  return livello === filtro;
}

const conSegno = (n: number) => `${n >= 0 ? '+' : '−'}${formattaEuro(Math.abs(n))}`;

/** In cima alla colonna: quanto fa l'evento se partono i bus proposti, e i filtri con quanti sono. */
export function TestataLinguette({ tragitti, statoDi, simulazione, scelte, filtro, onFiltro }: {
  tragitti: CalcoloBusTragitto[];
  statoDi: (t: CalcoloBusTragitto) => StatoTappa | null;
  /** Solo con il permesso di vedere i soldi. */
  simulazione: EventoSimulato | null;
  scelte: Scelte;
  filtro: FiltroLinguette;
  onFiltro: (f: FiltroLinguette) => void;
}) {
  const evento = simulazione ? contiEvento(simulazione, scelte) : null;
  const r = evento ? risultato(evento.voce) : 0;
  return (
    <div className="testata-linguette">
      {evento && evento.voce.bus > 0 && (
        <p className="totale-evento">
          Evento, se partono i bus proposti: <b className={`sim-valore ${r < 0 ? 'perdita' : 'guadagno'}`}>{conSegno(r)}</b>
          {evento.aTerra.passeggeri > 0 && <>, {evento.aTerra.passeggeri} a terra</>}
        </p>
      )}
      <div className="filtri-linguette" role="group" aria-label="Mostra i tragitti">
        {FILTRI.map((f) => {
          const quanti = tragitti.filter((t) => passaFiltro(statoDi(t), f.valore)).length;
          return (
            <button key={f.valore} type="button" className={`filtro-linguette${filtro === f.valore ? ' attivo' : ''}`} aria-pressed={filtro === f.valore} onClick={() => onFiltro(f.valore)}>
              {f.etichetta} {quanti}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Le righe piccole sotto il nome nella linguetta di un tragitto. */
export function DettagliLinguetta({ tragitto, contatore, simulazione, scelte, stato }: {
  tragitto: CalcoloBusTragitto;
  contatore: SuggerimentoLinea['contatorePareggio'] | undefined;
  simulazione: EventoSimulato | null;
  scelte: Scelte;
  stato: StatoTappa | null;
}) {
  const t = simulazione?.tragitti.find((x) => x.id === tragitto.tragittoId);
  const conti = t ? contiTragitto(t, scelte) : null;
  const numeri = [
    `${tragitto.totalePasseggeri} pass.`,
    contatore ? `pareggio ${contatore.contati}/${contatore.pareggio}` : null,
    conti && conti.voce.bus > 0 ? conSegno(risultato(conti.voce)) : null,
    conti && conti.aTerra.passeggeri > 0 ? `${conti.aTerra.passeggeri} a terra` : null,
  ].filter(Boolean).join(' · ');
  return (
    <>
      <span className="linguetta-dettagli">{numeri}</span>
      {stato?.testo && <span className="linguetta-dettagli">{stato.testo}</span>}
    </>
  );
}
