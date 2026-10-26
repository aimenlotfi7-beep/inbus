import type { BusFisico, CalcoloBusTragitto, SuggerimentoLinea } from '../../../api/eventi';
import type { EventoSimulato } from '../../../api/statistiche';
import { formattaData, formattaEuro, plurale } from '../../../shared/formato';
import { contiTragitto, giudizio, leggiScelte, risultato } from '../statistiche/contiBusInPiu';
import { CLASSE_BADGE_LIVELLO, type Partenza, type StatoTappa } from './statiPartenze';

/** «Da confermare», il quadro dell'evento (proprietario, ottobre 2026: «una
 *  tabella unica con una riga per tragitto»): tutti i tragitti insieme con
 *  passeggeri, pareggio, bus, preventivi, risultato e cosa c'è da fare, per
 *  vedere subito dove intervenire invece di aprire un tragitto alla volta.
 *  Una riga apre il suo tragitto qui sotto. Nessun conto nuovo: stati da
 *  statiPartenze.ts, contatore dal server, risultato dai conti di Bus in più. */
export function QuadroDaConfermare({ tragitti, partenze, bus, contatori, simulazione, statoDi, attivo, onApri }: {
  tragitti: CalcoloBusTragitto[];
  /** Le righe dell'elenco di Partenze (preventivi, senza posto, data del piano). */
  partenze: Map<string, Partenza>;
  bus: BusFisico[];
  contatori: Map<string, SuggerimentoLinea['contatorePareggio']>;
  /** Solo con il permesso di vedere i soldi; null = colonna nascosta. */
  simulazione: EventoSimulato | null;
  statoDi: (t: CalcoloBusTragitto) => StatoTappa | null;
  attivo: string | null;
  onApri: (tragittoId: string) => void;
}) {
  const scelte = leggiScelte();
  const contiDi = (tragittoId: string) => {
    const t = simulazione?.tragitti.find((x) => x.id === tragittoId);
    return t ? { conti: contiTragitto(t, scelte), simulato: t } : null;
  };

  return (
    <div className="quadro-da-confermare">
      <p className="section-label" style={{ marginBottom: 8 }}>Il quadro dell'evento</p>
      <div className="table-scroll adattiva">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tragitto</th>
              <th style={{ textAlign: 'right' }}>Passeggeri</th>
              <th>Pareggio</th>
              <th>Bus</th>
              <th>Preventivi dei bus</th>
              {simulazione && <th style={{ textAlign: 'right' }}>Se partono i bus proposti</th>}
              <th>Cosa fare</th>
            </tr>
          </thead>
          <tbody>
            {tragitti.map((t) => {
              const p = partenze.get(t.tragittoId);
              const stato = statoDi(t);
              const contatore = contatori.get(t.tragittoId);
              const confermati = bus.filter((b) => b.tragittiIds.includes(t.tragittoId)).length;
              const c = contiDi(t.tragittoId);
              const r = c ? risultato(c.conti.voce) : 0;
              // Il preventivo più basso tra quelli arrivati per i bus proposti di questo tragitto.
              const prezzi = c ? c.simulato.bus.filter((b) => b.tipo === 'proposta' && b.fonteCosto === 'preventivo' && b.costo !== null).map((b) => b.costo as number) : [];
              return (
                <tr
                  key={t.tragittoId}
                  className={`riga-apribile${attivo === t.tragittoId ? ' attiva' : ''}`}
                  onClick={() => onApri(t.tragittoId)}
                >
                  <td>
                    <button type="button" className="link-riga" onClick={(e) => { e.stopPropagation(); onApri(t.tragittoId); }}>{t.nome}</button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{t.totalePasseggeri}</b>
                    {(p?.senzaPosto ?? 0) > 0 && <><br /><span className="testo-secondario" style={{ color: 'var(--pink)' }}>{p!.senzaPosto} senza posto</span></>}
                  </td>
                  <td>
                    {contatore ? <>{contatore.contati} / {contatore.pareggio}<br /><span className="testo-secondario">per il {contatore.bus}° bus</span></> : <span className="testo-secondario">serve una quotazione</span>}
                  </td>
                  <td>
                    {plurale(confermati, 'confermato', 'confermati')}
                    {t.lineeDaConfermare > 0 && <><br /><span className="testo-secondario">{plurale(t.lineeDaConfermare, 'proposto', 'proposti')}</span></>}
                  </td>
                  <td>{testoPreventivi(t, p)}{prezzi.length > 0 && <><br /><span className="testo-secondario">il più basso {formattaEuro(Math.min(...prezzi))}</span></>}</td>
                  {simulazione && (
                    <td style={{ textAlign: 'right' }}>
                      {/* Senza nessun bus che parte non c'è un risultato da mostrare: solo chi resta a terra. */}
                      {c && c.conti.voce.bus > 0 && <b className={`sim-valore ${giudizio(r)}`}>{r >= 0 ? '+' : '−'}{formattaEuro(Math.abs(r))}</b>}
                      {(!c || c.conti.voce.bus === 0) && '—'}
                      {c && c.conti.aTerra.passeggeri > 0 && (
                        <><br /><span className="testo-secondario">{c.conti.aTerra.passeggeri} a terra{c.conti.voce.bus === 0 ? ', nessun bus' : ''}</span></>
                      )}
                    </td>
                  )}
                  <td>{stato?.testo ? <span className={`badge ${CLASSE_BADGE_LIVELLO[stato.livello]}`}>{stato.testo}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A che punto sono i preventivi dei bus proposti di un tragitto. */
function testoPreventivi(t: CalcoloBusTragitto, p: Partenza | undefined): string {
  if (t.lineeDaConfermare === 0) return '—';
  if (!p) return '…';
  if (p.risposteBus > 0) return plurale(p.risposteBus, 'risposta da valutare', 'risposte da valutare');
  if (p.proposteSenzaRichieste > 0) {
    return p.decisionePianoArrivata ? plurale(p.proposteSenzaRichieste, 'bus da chiedere', 'bus da chiedere') : `partono il ${formattaData(p.decisionePianoIl)}`;
  }
  return 'inviati, nessuna risposta';
}
