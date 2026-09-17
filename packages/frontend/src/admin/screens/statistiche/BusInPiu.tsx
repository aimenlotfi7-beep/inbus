import { useState } from 'react';
import { statisticheApi, type BusInPiuSimulato, type EventoSimulato, type StatisticheBusInPiu, type TipoBusInPiu, type TragittoSimulato } from '../../../api/statistiche';
import { CampoNumero } from '../../shared/CampoNumero';
import {
  BottoneCsv, Caricamento, ErroreStatistiche, formattaEuroIntero, formattaNumero, GrigliaKpi, Kpi, KpiExtra, pluraleNumero, Scheda, useDati, Vuoto,
} from './comuni';
import {
  conScelta, contiConcluso, contiEvento, contiSoloConfermati, contiTragitto, effettoBus, giudizio, leggiScelte, parte, salvaScelte,
  sommaConti, type Conti, type SceltaBus, type Scelte,
} from './contiBusInPiu';
import { nomeFileCsv, scaricaCsv } from './csv';
import { formattaGiorno, oggiRoma } from './periodo';

/** Statistiche › Bus in più: se far partire più bus, anche sotto il
 *  pareggio, porta in guadagno, pareggio o perdita. Per evento, per tutti
 *  gli eventi in vendita e per anno (gennaio-dicembre, per data
 *  dell'evento). I conti sono in contiBusInPiu.ts; SimulazioneTragitto serve
 *  anche alla pagina Linee. */

const ETICHETTA_TIPO: Record<TipoBusInPiu, string> = {
  'linea-senza-bus': 'linea confermata senza bus',
  proposta: 'da confermare · raggiunge il pareggio',
  'sotto-pareggio': 'sotto il pareggio',
};

const TESTO_GIUDIZIO = { guadagno: 'Guadagno', pareggio: 'Pareggio', perdita: 'Perdita' } as const;

/** "+700 €" / "−850 €". */
function conSegno(n: number): string {
  const testo = formattaEuroIntero(Math.abs(n));
  if (Math.round(n) === 0) return testo;
  return `${n > 0 ? '+' : '−'}${testo}`;
}

export function Giudizio({ margine }: { margine: number }) {
  const g = giudizio(margine);
  return <span className={`sim-giudizio ${g}`}>{TESTO_GIUDIZIO[g]}</span>;
}

/** Le scelte degli interruttori, ricordate in questo browser (le stesse in Statistiche e nella pagina Linee). */
export function useScelteBus() {
  const [scelte, setScelte] = useState<Scelte>(leggiScelte);
  function aggiorna(nuove: Scelte) {
    salvaScelte(nuove);
    setScelte(nuove);
  }
  return {
    scelte,
    cambia: (b: BusInPiuSimulato, cambio: SceltaBus) => aggiorna(conScelta(scelte, b, cambio)),
    azzera: (bus: BusInPiuSimulato[]) => aggiorna(Object.fromEntries(Object.entries(scelte).filter(([chiave]) => !bus.some((b) => b.chiave === chiave)))),
  };
}

type Cambia = (b: BusInPiuSimulato, cambio: SceltaBus) => void;

function RigaBus({ t, i, scelte, onCambia }: { t: TragittoSimulato; i: number; scelte: Scelte; onCambia: Cambia }) {
  const b = t.busInPiu[i];
  const acceso = parte(b, scelte);
  const effetto = effettoBus(t, i, scelte);
  const fonte = b.fonteCosto === 'preventivo'
    ? `preventivo più basso${b.preventivi > 1 ? ` di ${b.preventivi}` : ''}: ${formattaEuroIntero(b.costo ?? 0)}`
    : b.fonteCosto === 'quotazione' ? `quotazione: ${formattaEuroIntero(b.costo ?? 0)}` : 'nessun preventivo né quotazione';
  const costoAMano = scelte[b.chiave]?.costo;

  let testoEffetto;
  if (effetto.passeggeri === 0) {
    testoEffetto = <span className="stat-spento">Con gli altri bus scelti non fa partire nessuno in più.</span>;
  } else {
    // Rispetto agli altri bus come sono scelti: con due bus uguali accesi, spegnerne uno sposta i passeggeri sull'altro.
    testoEffetto = (
      <>
        {acceso ? 'Fa partire' : 'Farebbe partire'} {pluraleNumero(effetto.passeggeri, 'passeggero', 'passeggeri')} in più: {conSegno(effetto.incassoNetto)} di incasso
        {effetto.costo === null
          ? <> · <b>scrivi il costo per vedere il risultato</b></>
          : <> − {formattaEuroIntero(effetto.costo)} di bus = <b className={`sim-valore ${giudizio(effetto.risultato ?? 0)}`}>{conSegno(effetto.risultato ?? 0)}</b></>}
      </>
    );
  }

  return (
    <li className={`sim-bus${acceso ? ' parte' : ''}`}>
      <div className="sim-bus-nome">
        <b>{b.nome}</b>
        <span className="stat-sotto">{b.posti} posti · {ETICHETTA_TIPO[b.tipo]}</span>
      </div>
      <label className="sim-bus-costo">
        <span>Costo del bus</span>
        <CampoNumero
          valuta
          min={0}
          value={costoAMano}
          placeholder={b.costo === null ? 'da scrivere' : String(b.costo)}
          aria-label={`Costo di ${b.nome}`}
          onChange={(v) => onCambia(b, { costo: v !== undefined && v >= 0 ? v : undefined })}
        />
        <small>{costoAMano !== undefined ? `scritto a mano · ${fonte}` : fonte}</small>
      </label>
      <div className="sim-scelta" role="group" aria-label={`${b.nome}: parte o no`}>
        <button type="button" className="parte" aria-pressed={acceso} onClick={() => onCambia(b, { parte: true })}>Parte</button>
        <button type="button" className="non-parte" aria-pressed={!acceso} onClick={() => onCambia(b, { parte: false })}>Non parte</button>
      </div>
      <p className="sim-bus-effetto">{testoEffetto}</p>
    </li>
  );
}

function RigaConti({ conti, etichetta }: { conti: Conti; etichetta: string }) {
  return (
    <div className="sim-conti">
      <span>
        <b>{etichetta}</b>{' '}
        {pluraleNumero(conti.passeggeri, 'passeggero parte', 'passeggeri partono')}
        {conti.rimborsati > 0 && <> · <span className="stat-negativo">{pluraleNumero(conti.rimborsati, 'rimborsato', 'rimborsati')}</span></>}
        {' '}· {pluraleNumero(conti.bus, 'bus', 'bus')} · incasso {formattaEuroIntero(conti.incasso)} · bus {formattaEuroIntero(conti.costoBus)}
        {conti.commissioni > 0 && <> · commissioni {formattaEuroIntero(conti.commissioni)}</>}
      </span>
      <span className="sim-conti-margine">
        <b className={conti.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(conti.margine)}</b> <Giudizio margine={conti.margine} />
      </span>
    </div>
  );
}

/** Un tragitto: i bus confermati, poi ogni bus in più con il suo interruttore. */
export function SimulazioneTragitto({ t, scelte, onCambia, conNome = true }: { t: TragittoSimulato; scelte: Scelte; onCambia: Cambia; conNome?: boolean }) {
  const conti = contiTragitto(t, scelte);
  return (
    <div className="sim-tragitto">
      {conNome && <p className="sim-tragitto-nome">{t.nome}</p>}
      <p className="sim-confermati">
        {t.busConfermati === 0
          ? 'Nessun bus confermato'
          : `${pluraleNumero(t.busConfermati, 'bus confermato', 'bus confermati')}: ${formattaEuroIntero(t.costoBusConfermati)}`}
        {' '}· {pluraleNumero(t.passeggeri, 'prenotato', 'prenotati')}
        {t.busCostoStimato > 0 && ` · ${pluraleNumero(t.busCostoStimato, 'bus senza costo stimato', 'bus senza costo stimati')} con la quotazione`}
        {t.busSenzaCosto > 0 && <span className="stat-negativo"> · {pluraleNumero(t.busSenzaCosto, 'bus senza costo', 'bus senza costo')}: conta 0</span>}
        {t.inAttesaDiRimborso > 0 && ` · ${pluraleNumero(t.inAttesaDiRimborso, 'passeggero', 'passeggeri')} con un rimborso in attesa: non contano`}
      </p>
      {t.busInPiu.length === 0 ? (
        <p className="stat-vuoto">
          {t.passeggeri === 0
            ? 'Nessun prenotato, nessun bus in più.'
            : `Nessun bus in più: ${conti.rimborsati === 0 ? 'tutti hanno un posto sui bus confermati.' : 'chi resta fuori non entra in nessun bus (partenza passata o gruppo più grande di un bus).'}`}
        </p>
      ) : (
        <ul className="sim-bus-elenco">
          {t.busInPiu.map((b, i) => <RigaBus key={b.chiave} t={t} i={i} scelte={scelte} onCambia={onCambia} />)}
        </ul>
      )}
      <RigaConti conti={conti} etichetta="Con queste scelte:" />
    </div>
  );
}

function SchedaEvento({ e, scelte, onCambia, aperto, onApri }: { e: EventoSimulato; scelte: Scelte; onCambia: Cambia; aperto: boolean; onApri: () => void }) {
  const conti = contiEvento(e, scelte);
  const soloConfermati = contiSoloConfermati(e);
  const busInPiu = e.tragitti.flatMap((t) => t.busInPiu);
  const accesi = busInPiu.filter((b) => parte(b, scelte)).length;
  const differenza = conti.margine - soloConfermati.margine;
  return (
    <li className="sim-evento">
      <button type="button" className="sim-evento-testa" aria-expanded={aperto} onClick={onApri}>
        <span className="sim-evento-nome">
          <b>{e.artista}</b>
          <span className="stat-sotto">{[e.citta, formattaGiorno(e.data)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="sim-evento-bus">
          {busInPiu.length === 0 ? 'Nessun bus in più' : `${accesi} di ${pluraleNumero(busInPiu.length, 'bus in più parte', 'bus in più partono')}`}
          {conti.rimborsati > 0 && <span className="stat-sotto">{pluraleNumero(conti.rimborsati, 'rimborsato', 'rimborsati')}</span>}
        </span>
        <span className="sim-conti-margine">
          <b className={conti.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(conti.margine)}</b> <Giudizio margine={conti.margine} />
        </span>
        <span className="sim-freccia" aria-hidden="true">{aperto ? '▴' : '▾'}</span>
      </button>
      {aperto && (
        <div className="sim-evento-corpo">
          {e.tragitti.map((t) => <SimulazioneTragitto key={t.id} t={t} scelte={scelte} onCambia={onCambia} />)}
          {e.tragitti.length > 1 && <RigaConti conti={conti} etichetta="Tutto l'evento:" />}
          <p className="stat-didascalia">
            Solo con i bus confermati: {formattaEuroIntero(soloConfermati.margine)} ({pluraleNumero(soloConfermati.rimborsati, 'rimborsato', 'rimborsati')}).
            {Math.round(differenza) !== 0 && ` I bus in più che partono cambiano il margine di ${conSegno(differenza)}.`}
          </p>
        </div>
      )}
    </li>
  );
}

/** Il riquadro della pagina Linee: i bus in più di questo tragitto con i
 *  loro interruttori, e il conto di tutto l'evento. Non c'è se il tragitto
 *  non ha bus in più. `versione` cambia quando la pagina ricarica i dati. */
export function RiquadroBusInPiu({ eventoId, tragittoId, versione }: { eventoId: string; tragittoId: string; versione: number }) {
  const stato = useDati(() => statisticheApi.busInPiuEvento(eventoId), `${eventoId}|${versione}`);
  const { scelte, cambia } = useScelteBus();
  if (stato.errore) return <ErroreStatistiche motivo={stato.errore.motivo} onRiprova={stato.riprova} />;
  const e = stato.dati?.evento;
  const t = e?.tragitti.find((x) => x.id === tragittoId);
  if (!e || !t || t.busInPiu.length === 0) return null;
  return (
    <section className={`section-card sim-riquadro${stato.caricando ? ' stat-aggiorno' : ''}`} aria-busy={stato.caricando}>
      <div className="stat-scheda-testa">
        <h3>Bus in più: conviene farli partire?</h3>
      </div>
      <p className="sim-spiegazione">
        Prova a far partire o no ogni bus in più, anche sotto il pareggio: non conferma niente. Chi non trova posto viene
        rimborsato e non conta. Gli stessi interruttori sono in Statistiche › Bus in più.
      </p>
      <SimulazioneTragitto t={t} scelte={scelte} onCambia={cambia} conNome={false} />
      {e.tragitti.length > 1 && <RigaConti conti={contiEvento(e, scelte)} etichetta="Tutto l'evento:" />}
    </section>
  );
}

export function BusInPiu() {
  const [anno, setAnno] = useState(() => Number(oggiRoma().slice(0, 4)));
  const stato = useDati(() => statisticheApi.busInPiu(anno), String(anno));
  const { scelte, cambia, azzera } = useScelteBus();
  const anni = stato.dati?.anni.includes(anno) ? stato.dati.anni : [anno, ...(stato.dati?.anni ?? [])].sort((a, b) => b - a);
  return (
    <>
      <div className="stat-filtri">
        <label className="stat-campo">
          <span>Anno</span>
          <select value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
            {anni.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <p className="stat-periodo">Da gennaio a dicembre, per data dell'evento.</p>
      </div>
      <Caricamento stato={stato}>{(d) => <ContenutoBusInPiu d={d} scelte={scelte} onCambia={cambia} onAzzera={azzera} />}</Caricamento>
    </>
  );
}

function ContenutoBusInPiu({ d, scelte, onCambia, onAzzera }: { d: StatisticheBusInPiu; scelte: Scelte; onCambia: Cambia; onAzzera: (bus: BusInPiuSimulato[]) => void }) {
  const [aperti, setAperti] = useState<Set<string>>(() => new Set(d.inVendita.filter((e) => e.tragitti.some((t) => t.busInPiu.length > 0)).slice(0, 3).map((e) => e.id)));
  const inVenditaAnno = d.inVendita.filter((e) => e.anno === d.anno);
  const venditaAnno = sommaConti(inVenditaAnno.map((e) => contiEvento(e, scelte)));
  const passati = sommaConti(d.conclusi.map(contiConcluso));
  const anno = sommaConti([passati, venditaAnno]);
  const tuttaLaVendita = sommaConti(d.inVendita.map((e) => contiEvento(e, scelte)));
  const tuttiIBusInPiu = d.inVendita.flatMap((e) => e.tragitti.flatMap((t) => t.busInPiu));
  const sceltiAMano = tuttiIBusInPiu.filter((b) => scelte[b.chiave]).length;
  const costiIncompleti = d.conclusi.filter((e) => e.busSenzaCosto > 0 || e.passeggeriSenzaBus > 0).length;

  function apri(id: string) {
    setAperti((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(id)) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });
  }

  return (
    <>
      <GrigliaKpi>
        <Kpi etichetta={`Anno ${d.anno}`} valore={formattaEuroIntero(anno.margine)} tono={anno.margine < 0 ? 'negativo' : undefined}>
          <KpiExtra><Giudizio margine={anno.margine} /> passati e in vendita insieme</KpiExtra>
        </Kpi>
        <Kpi etichetta={`Eventi passati del ${d.anno}`} valore={formattaEuroIntero(passati.margine)} tono={passati.margine < 0 ? 'negativo' : undefined}>
          <KpiExtra>{pluraleNumero(d.conclusi.length, 'evento', 'eventi')} · numeri veri</KpiExtra>
        </Kpi>
        <Kpi etichetta={`In vendita nel ${d.anno}`} valore={formattaEuroIntero(venditaAnno.margine)} tono={venditaAnno.margine < 0 ? 'negativo' : undefined}>
          <KpiExtra>{pluraleNumero(inVenditaAnno.length, 'evento', 'eventi')} · con le tue scelte</KpiExtra>
        </Kpi>
        <Kpi etichetta="Tutti gli eventi in vendita" valore={formattaEuroIntero(tuttaLaVendita.margine)} tono={tuttaLaVendita.margine < 0 ? 'negativo' : undefined}>
          <KpiExtra><Giudizio margine={tuttaLaVendita.margine} /> {pluraleNumero(d.inVendita.length, 'evento', 'eventi')}, di ogni anno</KpiExtra>
        </Kpi>
      </GrigliaKpi>
      <p className="sim-spiegazione">
        Ogni bus in più ha un interruttore «Parte / Non parte»: è solo una prova, non conferma niente e non avvisa nessuno.
        Chi non trova posto sui bus che partono viene rimborsato e non conta nell'incasso. Di serie partono i bus che raggiungono
        il pareggio; quelli sotto il pareggio sono spenti. Il costo è il preventivo più basso ricevuto per quel bus, altrimenti la
        quotazione: puoi scriverne un altro.
      </p>

      <Scheda
        titolo="Eventi in vendita"
        conteggio={d.inVendita.length}
        azione={sceltiAMano > 0 ? (
          <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => onAzzera(tuttiIBusInPiu)}>
            Torna alle scelte di serie ({sceltiAMano})
          </button>
        ) : undefined}
      >
        {d.inVendita.length === 0 ? <Vuoto>Nessun evento in vendita.</Vuoto> : (
          <ul className="sim-eventi">
            {d.inVendita.map((e) => <SchedaEvento key={e.id} e={e} scelte={scelte} onCambia={onCambia} aperto={aperti.has(e.id)} onApri={() => apri(e.id)} />)}
          </ul>
        )}
      </Scheda>

      <Scheda
        titolo={`Eventi passati del ${d.anno}`}
        conteggio={d.conclusi.length}
        azione={(
          <BottoneCsv
            disabilitato={d.conclusi.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv(`eventi passati ${d.anno}`),
              ['Evento', 'Città', 'Data', 'Partiti', 'Rimborsati', 'Bus', 'Incasso €', 'Costo bus €', 'Commissioni €', 'Margine €'],
              d.conclusi.map((e) => [e.artista, e.citta, formattaGiorno(e.data), e.passeggeri, e.nonPartiti, e.bus, e.incasso, e.costoBus, e.commissioni, e.margine]),
            )}
          />
        )}
      >
        {d.conclusi.length === 0 ? <Vuoto>Nessun evento passato nel {d.anno}.</Vuoto> : (
          <>
            <div className="table-scroll">
              <table className="data-table stat-larga">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Data</th>
                    <th className="stat-num">Partiti</th>
                    <th className="stat-num">Rimborsati</th>
                    <th className="stat-num">Bus</th>
                    <th className="stat-num">Incasso</th>
                    <th className="stat-num">Costo bus</th>
                    <th className="stat-num">Commissioni</th>
                    <th className="stat-num">Margine</th>
                  </tr>
                </thead>
                <tbody>
                  {d.conclusi.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <b>{e.artista}</b>
                        {e.citta && <span className="stat-sotto">{e.citta}</span>}
                      </td>
                      <td className="stat-senza-a-capo">{formattaGiorno(e.data)}</td>
                      <td className="stat-num">{formattaNumero(e.passeggeri)}</td>
                      <td className="stat-num">{e.nonPartiti > 0 ? formattaNumero(e.nonPartiti) : <span className="stat-spento">0</span>}</td>
                      <td className="stat-num">{formattaNumero(e.bus)}</td>
                      <td className="stat-num">{formattaEuroIntero(e.incasso)}</td>
                      <td className="stat-num">
                        {formattaEuroIntero(e.costoBus)}
                        {(e.busSenzaCosto > 0 || e.passeggeriSenzaBus > 0) && <span className="stat-sotto"><span className="badge attenzione">costi incompleti</span></span>}
                        {e.busCostoStimato > 0 && <span className="stat-sotto">{pluraleNumero(e.busCostoStimato, 'bus stimato', 'bus stimati')} con la quotazione</span>}
                      </td>
                      <td className="stat-num">{formattaEuroIntero(e.commissioni)}</td>
                      <td className="stat-num">
                        <span className={e.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(e.margine)}</span>
                        <span className="stat-sotto"><Giudizio margine={e.margine} /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totale</td>
                    <td />
                    <td className="stat-num">{formattaNumero(passati.passeggeri)}</td>
                    <td className="stat-num">{formattaNumero(passati.rimborsati)}</td>
                    <td className="stat-num">{formattaNumero(passati.bus)}</td>
                    <td className="stat-num">{formattaEuroIntero(passati.incasso)}</td>
                    <td className="stat-num">{formattaEuroIntero(passati.costoBus)}</td>
                    <td className="stat-num">{formattaEuroIntero(passati.commissioni)}</td>
                    <td className="stat-num"><span className={passati.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(passati.margine)}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="stat-didascalia">
              Numeri veri: contano solo i passeggeri saliti su un bus. Chi è rimasto senza bus o ha un rimborso in attesa viene
              rimborsato e non conta. Un bus senza costo vale la quotazione del suo tragitto.
              {costiIncompleti > 0 && ` ${pluraleNumero(costiIncompleti, 'evento ha', 'eventi hanno')} costi incompleti (bus senza costo né quotazione, o passeggeri senza nessun bus): il margine vero è più basso.`}
            </p>
          </>
        )}
      </Scheda>
    </>
  );
}
