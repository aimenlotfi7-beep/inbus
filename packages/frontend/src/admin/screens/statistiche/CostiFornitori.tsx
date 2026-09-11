import { statisticheApi, type StatisticheCosti } from '../../../api/statistiche';
import { formattaEuro, plurale } from '../../../shared/formato';
import {
  BottoneCsv, Caricamento, chiaveFiltro, formattaEuroIntero, formattaNumero, formattaPercentuale, GrigliaKpi, Kpi,
  NotaCostiMancanti, Scheda, useDati, useSegnalaPeriodo, Vuoto, type PropsScheda,
} from './comuni';
import { nomeFileCsv, scaricaCsv } from './csv';
import { Colonne } from './grafici';
import { formattaGiorno } from './periodo';

export function CostiFornitori({ filtro, onPeriodo }: PropsScheda) {
  const stato = useDati(() => statisticheApi.costi(filtro), chiaveFiltro(filtro));
  useSegnalaPeriodo(stato.dati && !stato.caricando ? stato.dati.periodo : null, onPeriodo);
  return <Caricamento stato={stato}>{(d) => <ContenutoCosti d={d} />}</Caricamento>;
}

/** Sotto le 48 ore in ore, poi in giorni. */
function tempoRisposta(ore: number | null): string {
  if (ore === null) return '—';
  if (ore < 1) return "meno di un'ora";
  if (ore < 48) return plurale(Math.round(ore), 'ora', 'ore');
  return plurale(Math.round(ore / 24), 'giorno', 'giorni');
}

function Numero({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="riepilogo-numero">
      <span>{etichetta}</span>
      <b>{valore}</b>
    </div>
  );
}

function ContenutoCosti({ d }: { d: StatisticheCosti }) {
  const t = d.totali;
  // Già in ordine dal server, dalla data più recente.
  const eventi = d.eventi;
  const somma = (campo: (r: StatisticheCosti['eventi'][number]) => number) => eventi.reduce((s, r) => s + campo(r), 0);
  const margineTotale = somma((e) => e.margine);
  const c = d.cancellazioni;
  const r = d.rimborsi;

  return (
    <>
      <GrigliaKpi>
        <Kpi etichetta="Incasso" valore={formattaEuroIntero(t.incasso)} />
        <Kpi etichetta="Costo dei bus" valore={formattaEuroIntero(t.costoBus)} />
        <Kpi etichetta="Commissioni" valore={formattaEuroIntero(t.commissioni)} />
        <Kpi etichetta="Margine" valore={formattaEuroIntero(t.margine)} tono={t.margine < 0 ? 'negativo' : undefined} />
      </GrigliaKpi>
      <NotaCostiMancanti eventi={t.eventiConCostiMancanti} />

      <Scheda
        titolo="Margine per evento"
        conteggio={eventi.length}
        azione={(
          <BottoneCsv
            disabilitato={eventi.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv('margine per evento', d.periodo),
              ['Evento', 'Città', 'Data', 'Passeggeri', 'Bus', 'Incasso €', 'Costo bus €', 'Costi completi', 'Commissioni €', 'Margine €'],
              eventi.map((e) => [e.artista, e.citta, formattaGiorno(e.data), e.passeggeri, e.bus, e.incasso, e.costoBus, e.costoCompleto, e.commissioni, e.margine]),
            )}
          />
        )}
      >
        {eventi.length === 0 ? <Vuoto>Nessun evento nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table stat-larga">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Data</th>
                  <th className="stat-num">Passeggeri</th>
                  <th className="stat-num">Bus</th>
                  <th className="stat-num">Incasso</th>
                  <th className="stat-num">Costo bus</th>
                  <th className="stat-num">Commissioni</th>
                  <th className="stat-num">Margine</th>
                </tr>
              </thead>
              <tbody>
                {eventi.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.artista}</b>
                      {e.citta && <span className="stat-sotto">{e.citta}</span>}
                    </td>
                    <td className="stat-senza-a-capo">{formattaGiorno(e.data)}</td>
                    <td className="stat-num">{formattaNumero(e.passeggeri)}</td>
                    <td className="stat-num">{formattaNumero(e.bus)}</td>
                    <td className="stat-num">{formattaEuroIntero(e.incasso)}</td>
                    <td className="stat-num">
                      {formattaEuroIntero(e.costoBus)}
                      {!e.costoCompleto && <span className="stat-sotto"><span className="badge attenzione">costi incompleti</span></span>}
                    </td>
                    <td className="stat-num">{formattaEuroIntero(e.commissioni)}</td>
                    <td className="stat-num"><span className={e.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(e.margine)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totale</td>
                  <td />
                  <td className="stat-num">{formattaNumero(somma((e) => e.passeggeri))}</td>
                  <td className="stat-num">{formattaNumero(somma((e) => e.bus))}</td>
                  <td className="stat-num">{formattaEuroIntero(somma((e) => e.incasso))}</td>
                  <td className="stat-num">{formattaEuroIntero(somma((e) => e.costoBus))}</td>
                  <td className="stat-num">{formattaEuroIntero(somma((e) => e.commissioni))}</td>
                  <td className="stat-num">
                    <span className={margineTotale < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(margineTotale)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Scheda>

      <Scheda
        titolo="Fornitori"
        azione={(
          <BottoneCsv
            disabilitato={d.fornitori.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv('fornitori', d.periodo),
              ['Fornitore', 'Richieste', 'Risposte', 'Tasso di risposta %', 'Ore di risposta (valore centrale)', 'Scelto', 'Prezzo medio €'],
              d.fornitori.map((f) => [
                f.nome, f.richieste, f.risposte, f.tassoRisposta,
                f.oreRispostaMediana === null ? null : Math.round(f.oreRispostaMediana), f.scelto, f.prezzoMedio,
              ]),
            )}
          />
        )}
      >
        {d.fornitori.length === 0 ? <Vuoto>Nessuna richiesta di preventivo nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fornitore</th>
                  <th className="stat-num">Richieste</th>
                  <th className="stat-num">Risposte</th>
                  <th className="stat-num">Tempo di risposta</th>
                  <th className="stat-num">Scelto</th>
                  <th className="stat-num">Prezzo medio</th>
                </tr>
              </thead>
              <tbody>
                {d.fornitori.map((f) => (
                  <tr key={f.id}>
                    <td><b>{f.nome}</b></td>
                    <td className="stat-num">{formattaNumero(f.richieste)}</td>
                    <td className="stat-num">
                      {formattaNumero(f.risposte)}
                      {f.tassoRisposta !== null && <span className="stat-sotto">{formattaPercentuale(f.tassoRisposta)}</span>}
                    </td>
                    <td className="stat-num">
                      {f.oreRispostaMediana === null ? <span className="stat-spento">—</span> : tempoRisposta(f.oreRispostaMediana)}
                    </td>
                    <td className="stat-num">{formattaNumero(f.scelto)}</td>
                    <td className="stat-num">{f.prezzoMedio === null ? <span className="stat-spento">—</span> : formattaEuro(f.prezzoMedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Scheda>

      <Scheda
        titolo="Prezzi per tratta"
        azione={(
          <BottoneCsv
            disabilitato={d.tratte.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv('prezzi per tratta', d.periodo),
              ['Partenza', 'Arrivo', 'Tragitto', 'Evento', 'Data', 'Prezzo €', 'Km', '€/km'],
              d.tratte.map((x) => [x.partenza, x.arrivo, x.nomeTragitto, x.artista, formattaGiorno(x.data), x.prezzo, x.km, x.euroKm]),
            )}
          />
        )}
      >
        {d.tratte.length === 0 ? <Vuoto>Nessun preventivo accettato per gli eventi del periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tratta</th>
                  <th>Evento</th>
                  <th>Data</th>
                  <th className="stat-num">Prezzo</th>
                  <th className="stat-num">Km</th>
                  <th className="stat-num">€/km</th>
                </tr>
              </thead>
              <tbody>
                {d.tratte.map((x, k) => (
                  <tr key={`${x.nomeTragitto}-${x.data}-${k}`}>
                    <td>
                      {x.partenza} → {x.arrivo}
                      {x.nomeTragitto && <span className="stat-sotto">{x.nomeTragitto}</span>}
                    </td>
                    <td>{x.artista}</td>
                    <td className="stat-senza-a-capo">{formattaGiorno(x.data)}</td>
                    <td className="stat-num">{formattaEuro(x.prezzo)}</td>
                    <td className="stat-num">{x.km === null ? <span className="stat-spento">—</span> : formattaNumero(x.km)}</td>
                    <td className="stat-num">{x.euroKm === null ? <span className="stat-spento">—</span> : formattaEuro(x.euroKm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Scheda>

      <Scheda titolo="Cancellazioni e rimborsi">
        <p className="section-label">Cancellazioni</p>
        <div className="riepilogo-numeri">
          <Numero etichetta="Prenotazioni" valore={formattaNumero(c.prenotazioni)} />
          <Numero etichetta="Passeggeri" valore={formattaNumero(c.passeggeri)} />
          <Numero etichetta="Importo" valore={formattaEuroIntero(c.importo)} />
        </div>
        <Colonne
          conAsse
          altezza={170}
          nomeValore="prenotazioni cancellate"
          testoVuoto="Nessuna cancellazione nel periodo."
          dati={d.periodo.intervalli.map((iv, k) => ({
            etichetta: iv.etichetta,
            valore: c.perIntervallo[k]?.prenotazioni ?? 0,
            dettaglio: `${formattaEuro(c.perIntervallo[k]?.importo ?? 0)} di importo`,
          }))}
          ariaLabel={`Prenotazioni cancellate nel periodo: ${formattaNumero(c.prenotazioni)} in tutto, per un importo di ${formattaEuroIntero(c.importo)}.`}
        />

        <p className="section-label stat-titoletto">Rimborsi</p>
        <div className="riepilogo-numeri">
          <Numero etichetta="Richieste" valore={formattaNumero(r.richieste)} />
          <Numero etichetta="In attesa" valore={formattaNumero(r.inAttesa)} />
          <Numero etichetta="Approvate" valore={formattaNumero(r.approvate)} />
          <Numero etichetta="Rifiutate" valore={formattaNumero(r.rifiutate)} />
          <Numero etichetta="Da variazione" valore={formattaNumero(r.daVariazione)} />
          <Numero etichetta="Importo approvato" valore={formattaEuroIntero(r.importoApprovato)} />
        </div>
        <p className="stat-didascalia">La data delle cancellazioni si registra da settembre 2026: prima non c'era.</p>
      </Scheda>
    </>
  );
}
