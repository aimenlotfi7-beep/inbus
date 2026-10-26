import { useState } from 'react';
import { statisticheApi, type RaggruppaConfronto, type RigaConfronto, type StatisticheConfronto } from '../../../api/statistiche';
import { formattaEuro } from '../../../shared/formato';
import {
  BottoneCsv, Caricamento, chiaveFiltro, formattaEuroIntero, formattaNumero, formattaPercentuale, Incassati, MargineAOggi,
  NotaCostiMancanti, pluraleNumero, Scheda, useDati, useSegnalaPeriodo, Vuoto, type PropsScheda,
} from './comuni';
import { nomeFileCsv, scaricaCsv } from './csv';
import { MiniBarra } from './grafici';

/** Statistiche › Confronto: gli eventi del periodo divisi per categoria,
 *  genere, città, tour o mese, uno accanto all'altro (proprietario, ottobre
 *  2026: su che tipo di evento si guadagna). Stessi conti di Costi e
 *  fornitori, per data dell'evento. In cima la risposta in parole. */

const RAGGRUPPAMENTI: { id: RaggruppaConfronto; etichetta: string; colonna: string }[] = [
  { id: 'categoria', etichetta: 'Categoria', colonna: 'Categoria' },
  { id: 'genere', etichetta: 'Genere', colonna: 'Genere' },
  { id: 'citta', etichetta: "Città dell'evento", colonna: 'Città' },
  { id: 'tour', etichetta: 'Tour', colonna: 'Tour' },
  { id: 'mese', etichetta: "Mese dell'evento", colonna: 'Mese' },
];

type Ordine = 'margine' | 'marginePerPasseggero' | 'passeggeri' | 'eventi' | 'calendario';

const ORDINI: { id: Ordine; etichetta: string }[] = [
  { id: 'margine', etichetta: 'Margine previsto' },
  { id: 'marginePerPasseggero', etichetta: 'Margine per passeggero' },
  { id: 'passeggeri', etichetta: 'Passeggeri' },
  { id: 'eventi', etichetta: 'Numero di eventi' },
  { id: 'calendario', etichetta: 'Calendario' },
];

const CHIAVE_SCELTA = 'inbus_admin_statistiche_confronto';

function leggiScelta(): RaggruppaConfronto {
  try {
    const letto = localStorage.getItem(CHIAVE_SCELTA);
    return RAGGRUPPAMENTI.find((r) => r.id === letto)?.id ?? 'categoria';
  } catch {
    return 'categoria';
  }
}

function salvaScelta(per: RaggruppaConfronto) {
  try {
    localStorage.setItem(CHIAVE_SCELTA, per);
  } catch {
    // Senza memoria del browser alla prossima apertura si riparte da Categoria.
  }
}

const conSegno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formattaEuro(Math.abs(n))}`;

/** "2,5 per evento": con pochi passeggeri l'intero darebbe 0. */
const unDecimale = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const perEvento = (n: number) => `${unDecimale.format(n)} per evento`;

function ordina(righe: RigaConfronto[], ordine: Ordine): RigaConfronto[] {
  if (ordine === 'calendario') return righe;
  const valore = (r: RigaConfronto) => (ordine === 'marginePerPasseggero' ? r.marginePerPasseggero ?? -Infinity : r[ordine]);
  return [...righe].sort((a, b) => valore(b) - valore(a));
}

export function Confronto({ filtro, onPeriodo }: PropsScheda) {
  const [per, setPer] = useState<RaggruppaConfronto>(leggiScelta);
  const [ordine, setOrdine] = useState<Ordine>(() => (leggiScelta() === 'mese' ? 'calendario' : 'margine'));
  const stato = useDati(() => statisticheApi.confronto(filtro, per), `${chiaveFiltro(filtro)}|${per}`);
  useSegnalaPeriodo(stato.dati && !stato.caricando ? stato.dati.periodo : null, onPeriodo);

  function cambiaPer(nuovo: RaggruppaConfronto) {
    setPer(nuovo);
    salvaScelta(nuovo);
    // Per mese si legge meglio in ordine di calendario; per il resto dal margine.
    setOrdine(nuovo === 'mese' ? 'calendario' : 'margine');
  }

  const scelta = RAGGRUPPAMENTI.find((r) => r.id === per)!;
  return (
    <>
      <div className="stat-filtri">
        <label className="stat-campo">
          <span>Dividi gli eventi per</span>
          <select value={per} onChange={(e) => cambiaPer(e.target.value as RaggruppaConfronto)}>
            {RAGGRUPPAMENTI.map((r) => <option key={r.id} value={r.id}>{r.etichetta}</option>)}
          </select>
        </label>
        <label className="stat-campo">
          <span>Ordina per</span>
          <select value={ordine} onChange={(e) => setOrdine(e.target.value as Ordine)}>
            {ORDINI.map((o) => <option key={o.id} value={o.id}>{o.etichetta}</option>)}
          </select>
        </label>
      </div>
      <Caricamento stato={stato}>{(d) => <ContenutoConfronto d={d} colonna={scelta.colonna} ordine={ordine} />}</Caricamento>
    </>
  );
}

/** La risposta in parole: il gruppo che rende di più e quello che rende di meno a passeggero. */
function InBreve({ righe }: { righe: RigaConfronto[] }) {
  const conPasseggeri = righe.filter((r) => r.marginePerPasseggero !== null);
  if (conPasseggeri.length < 2) return null;
  const ordinate = [...conPasseggeri].sort((a, b) => b.marginePerPasseggero! - a.marginePerPasseggero!);
  const migliore = ordinate[0];
  const peggiore = ordinate[ordinate.length - 1];
  return (
    <p className="stat-in-breve">
      Rende di più <b>{migliore.nome}</b>: {conSegno(migliore.marginePerPasseggero!)} a passeggero
      ({pluraleNumero(migliore.eventi, 'evento', 'eventi')}). Rende di meno <b>{peggiore.nome}</b>: {conSegno(peggiore.marginePerPasseggero!)} a passeggero
      ({pluraleNumero(peggiore.eventi, 'evento', 'eventi')}).
    </p>
  );
}

function BarraMargine({ valore, massimo }: { valore: number; massimo: number }) {
  const quota = massimo > 0 ? Math.min(100, (Math.abs(valore) / massimo) * 100) : 0;
  return (
    <span className="stat-margine-barra" aria-hidden="true">
      <span className="stat-margine-meta negativa">{valore < 0 && quota > 0 && <span style={{ width: `max(2px, ${quota.toFixed(2)}%)` }} />}</span>
      <span className="stat-margine-meta positiva">{valore > 0 && quota > 0 && <span style={{ width: `max(2px, ${quota.toFixed(2)}%)` }} />}</span>
    </span>
  );
}

function ContenutoConfronto({ d, colonna, ordine }: { d: StatisticheConfronto; colonna: string; ordine: Ordine }) {
  const righe = ordina(d.gruppi, ordine);
  const t = d.totale;
  const maxMargine = Math.max(0, ...righe.map((r) => Math.abs(r.margine)));
  const maxRiempimento = 100;
  // Un evento in due tour compare in tutti e due: la somma delle righe supera il totale.
  const contatiDuevolte = d.per === 'tour' && righe.reduce((s, r) => s + r.eventi, 0) > t.eventi;
  const spese = (r: RigaConfronto) => r.costoBus + r.commissioni + r.compensi;

  return (
    <>
      <InBreve righe={righe} />
      <Scheda
        titolo={`Eventi del periodo per ${colonna.toLowerCase()}`}
        conteggio={righe.length}
        azione={(
          <BottoneCsv
            disabilitato={righe.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv(`confronto per ${colonna.toLowerCase()}`, d.periodo),
              [colonna, 'Eventi', 'Passeggeri', 'Passeggeri per evento', 'Riempimento bus %', 'Incasso previsto €', 'Incassato €', 'Costo bus €', 'Commissioni €', 'Compensi €', 'Margine previsto €', 'Margine a oggi €', 'Margine per passeggero €', 'Eventi in perdita', 'Eventi con costi incompleti'],
              [...righe, t].map((r) => [
                r.nome, r.eventi, r.passeggeri, r.passeggeriPerEvento, r.riempimento, r.incasso, r.incassato, r.costoBus, r.commissioni, r.compensi,
                r.margine, r.margineAOggi, r.marginePerPasseggero, r.eventiInPerdita, r.eventiConCostiMancanti,
              ]),
            )}
          />
        )}
      >
        {righe.length === 0 ? <Vuoto>Nessun evento con la data nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table stat-larga stat-confronto">
              <thead>
                <tr>
                  <th>{colonna}</th>
                  <th className="stat-num">Eventi</th>
                  <th className="stat-num">Passeggeri</th>
                  <th>Riempimento bus</th>
                  <th className="stat-num">Incasso previsto</th>
                  <th className="stat-num">Spese</th>
                  <th>Margine previsto</th>
                  <th className="stat-num">Margine per passeggero</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.chiave}>
                    <td>
                      <b>{r.nome}</b>
                      {(r.eventiInPerdita > 0 || r.eventiConCostiMancanti > 0) && (
                        <span className="stat-sotto stat-badges">
                          {r.eventiInPerdita > 0 && <span className="badge non-coperta">{pluraleNumero(r.eventiInPerdita, 'evento', 'eventi')} in perdita</span>}
                          {r.eventiConCostiMancanti > 0 && <span className="badge attenzione">{r.eventiConCostiMancanti === 1 ? '1 con costi incompleti' : `${formattaNumero(r.eventiConCostiMancanti)} con costi incompleti`}</span>}
                        </span>
                      )}
                    </td>
                    <td className="stat-num">{formattaNumero(r.eventi)}</td>
                    <td className="stat-num">
                      {formattaNumero(r.passeggeri)}
                      <span className="stat-sotto">{perEvento(r.passeggeriPerEvento)}</span>
                    </td>
                    <td>
                      {r.riempimento === null
                        ? <span className="stat-spento">nessun bus</span>
                        : <MiniBarra valore={r.riempimento} massimo={maxRiempimento} testo={formattaPercentuale(r.riempimento)} />}
                    </td>
                    <td className="stat-num">
                      {formattaEuroIntero(r.incasso)}
                      <Incassati incassato={r.incassato} previsto={r.incasso} />
                    </td>
                    <td className="stat-num">
                      {formattaEuroIntero(spese(r))}
                      <span className="stat-sotto">bus {formattaEuroIntero(r.costoBus)}</span>
                    </td>
                    <td>
                      <span className="stat-margine-cella">
                        <BarraMargine valore={r.margine} massimo={maxMargine} />
                        <span className={r.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(r.margine)}</span>
                      </span>
                      <MargineAOggi aOggi={r.margineAOggi} previsto={r.margine} />
                    </td>
                    <td className="stat-num">
                      {r.marginePerPasseggero === null
                        ? <span className="stat-spento">—</span>
                        : <b className={r.marginePerPasseggero < 0 ? 'stat-negativo' : undefined}>{conSegno(r.marginePerPasseggero)}</b>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totale</td>
                  <td className="stat-num">{formattaNumero(t.eventi)}</td>
                  <td className="stat-num">
                    {formattaNumero(t.passeggeri)}
                    <span className="stat-sotto">{perEvento(t.passeggeriPerEvento)}</span>
                  </td>
                  <td>{t.riempimento === null ? <span className="stat-spento">—</span> : formattaPercentuale(t.riempimento)}</td>
                  <td className="stat-num">{formattaEuroIntero(t.incasso)}</td>
                  <td className="stat-num">{formattaEuroIntero(spese(t))}</td>
                  <td>
                    <span className={t.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(t.margine)}</span>
                    <MargineAOggi aOggi={t.margineAOggi} previsto={t.margine} />
                  </td>
                  <td className="stat-num">{t.marginePerPasseggero === null ? '—' : conSegno(t.marginePerPasseggero)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="stat-didascalia">
          Eventi con la data nel periodo. Spese = bus, commissioni di promoter e White Label, compensi dei collaboratori.
          {' '}«In perdita»: eventi con bus e margine sotto zero.
          {contatiDuevolte && ' Un evento in più tour conta in ognuno; il totale lo conta una volta.'}
        </p>
      </Scheda>
      <NotaCostiMancanti eventi={t.eventiConCostiMancanti} />
    </>
  );
}
