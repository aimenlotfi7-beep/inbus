import { statisticheApi, type RigaFonte, type StatisticheVendite, type TipoFonte } from '../../../api/statistiche';
import { formattaEuro } from '../../../shared/formato';
import {
  BottoneCsv, Caricamento, chiaveFiltro, ETICHETTA_FONTE, formattaEuroIntero, formattaNumero, formattaPercentuale,
  GrigliaKpi, Kpi, KpiExtra, pluraleNumero, Scheda, useDati, useSegnalaPeriodo, Vuoto, type PropsScheda,
} from './comuni';
import { nomeFileCsv, scaricaCsv } from './csv';
import { BarraDivisa, Colonne, MiniBarra, Minigrafico } from './grafici';

export function VenditeCanali({ filtro, onPeriodo }: PropsScheda) {
  const stato = useDati(() => statisticheApi.vendite(filtro), chiaveFiltro(filtro));
  useSegnalaPeriodo(stato.dati && !stato.caricando ? stato.dati.periodo : null, onPeriodo);
  return <Caricamento stato={stato}>{(d) => <ContenutoVendite d={d} />}</Caricamento>;
}

function CellaFonte({ tipo, nome }: { tipo: TipoFonte; nome: string }) {
  const etichetta = ETICHETTA_FONTE[tipo];
  const mostraNome = nome.trim() !== '' && nome.trim().toLowerCase() !== etichetta.toLowerCase();
  if (!mostraNome) return <>{etichetta}</>;
  return (
    <>
      <span className="stat-tipo">{etichetta}</span>
      {nome}
    </>
  );
}

function ContenutoVendite({ d }: { d: StatisticheVendite }) {
  const somma = (campo: (r: RigaFonte) => number) => d.fonti.reduce((s, r) => s + campo(r), 0);
  const incasso = somma((r) => r.incasso);
  const commissioni = somma((r) => r.commissione);
  const margine = somma((r) => r.margineNetto);
  const maxIncasso = Math.max(0, ...d.fonti.map((r) => r.incasso));
  const p = d.pagamento;

  return (
    <>
      <GrigliaKpi>
        <Kpi etichetta="Incasso" valore={formattaEuroIntero(incasso)} />
        <Kpi etichetta="Commissioni" valore={formattaEuroIntero(commissioni)} />
        <Kpi etichetta="Margine netto" valore={formattaEuroIntero(margine)} tono={margine < 0 ? 'negativo' : undefined} />
        <Kpi etichetta="Bundle" valore={formattaEuroIntero(d.bundle.incasso)}>
          <KpiExtra>{pluraleNumero(d.bundle.passeggeri, 'passeggero', 'passeggeri')}</KpiExtra>
        </Kpi>
      </GrigliaKpi>

      <Scheda
        titolo="Incasso per fonte"
        azione={(
          <BottoneCsv
            disabilitato={d.fonti.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv('incasso per fonte', d.periodo),
              ['Tipo', 'Fonte', 'Prenotazioni', 'Passeggeri', 'Incasso €', 'Commissione €', 'Margine netto €'],
              d.fonti.map((r) => [ETICHETTA_FONTE[r.tipo], r.nome, r.prenotazioni, r.passeggeri, r.incasso, r.commissione, r.margineNetto]),
            )}
          />
        )}
      >
        {d.fonti.length === 0 ? <Vuoto>Nessuna vendita nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th className="stat-num">Prenotazioni</th>
                  <th className="stat-num">Passeggeri</th>
                  <th>Incasso</th>
                  <th className="stat-num">Commissione</th>
                  <th className="stat-num">Margine netto</th>
                </tr>
              </thead>
              <tbody>
                {d.fonti.map((r, k) => (
                  <tr key={`${r.tipo}-${r.nome}-${k}`}>
                    <td><CellaFonte tipo={r.tipo} nome={r.nome} /></td>
                    <td className="stat-num">{formattaNumero(r.prenotazioni)}</td>
                    <td className="stat-num">{formattaNumero(r.passeggeri)}</td>
                    <td><MiniBarra valore={r.incasso} massimo={maxIncasso} testo={formattaEuroIntero(r.incasso)} /></td>
                    <td className="stat-num">{r.commissione > 0 ? formattaEuroIntero(r.commissione) : <span className="stat-spento">—</span>}</td>
                    <td className="stat-num">
                      <span className={r.margineNetto < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(r.margineNetto)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totale</td>
                  <td className="stat-num">{formattaNumero(somma((r) => r.prenotazioni))}</td>
                  <td className="stat-num">{formattaNumero(somma((r) => r.passeggeri))}</td>
                  <td><span className="stat-mini-rientro">{formattaEuroIntero(incasso)}</span></td>
                  <td className="stat-num">{formattaEuroIntero(commissioni)}</td>
                  <td className="stat-num"><span className={margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(margine)}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Scheda>

      <Scheda
        titolo="Promoter"
        azione={(
          <BottoneCsv
            disabilitato={d.promoter.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv('promoter', d.periodo),
              ['Promoter', 'Codice', 'Prenotazioni', 'Passeggeri', 'Incasso €', 'Commissione €'],
              d.promoter.map((r) => [r.nome, r.codice, r.prenotazioni, r.passeggeri, r.incasso, r.commissione]),
            )}
          />
        )}
      >
        {d.promoter.length === 0 ? <Vuoto>Nessuna vendita dei promoter nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Promoter</th>
                  <th className="stat-num">Prenotazioni</th>
                  <th className="stat-num">Passeggeri</th>
                  <th className="stat-num">Incasso</th>
                  <th className="stat-num">Commissione</th>
                  <th>Andamento</th>
                </tr>
              </thead>
              <tbody>
                {d.promoter.map((r, k) => (
                  <tr key={r.id ?? `${r.codice}-${k}`}>
                    <td>
                      {r.nome}
                      {r.codice && <span className="stat-sotto stat-codice">{r.codice}</span>}
                    </td>
                    <td className="stat-num">{formattaNumero(r.prenotazioni)}</td>
                    <td className="stat-num">{formattaNumero(r.passeggeri)}</td>
                    <td className="stat-num">{formattaEuroIntero(r.incasso)}</td>
                    <td className="stat-num">{formattaEuroIntero(r.commissione)}</td>
                    <td>
                      <Minigrafico
                        valori={r.andamento}
                        ariaLabel={`Passeggeri di ${r.nome} per ${d.periodo.granularita}: ${r.andamento.map(formattaNumero).join(', ')}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Scheda>

      <div className="stat-due-colonne stat-uguali">
        <Scheda titolo="Anticipo d'acquisto">
          <Colonne
            dati={d.anticipo.map((a) => ({ etichetta: a.fascia, valore: a.percentuale, testo: formattaPercentuale(a.percentuale) }))}
            ariaLabel={`Passeggeri per giorni di anticipo: ${d.anticipo.map((a) => `${a.fascia} ${formattaPercentuale(a.percentuale)}`).join(', ')}`}
          />
          <p className="stat-didascalia">Passeggeri per giorni tra la prenotazione e l'evento.</p>
        </Scheda>

        <Scheda titolo="Pagamenti">
          <BarraDivisa
            titolo="Prenotazioni per tipo di pagamento"
            parti={[
              { etichetta: 'Pagamento completo', valore: p.completo },
              { etichetta: 'Acconto', valore: p.acconto },
            ]}
          />
          {p.daSaldare === 0 ? (
            <p className="stat-testo">Nessuna prenotazione ad acconto da saldare.</p>
          ) : (
            <p className="stat-testo">
              {pluraleNumero(p.daSaldare, 'prenotazione da saldare', 'prenotazioni da saldare')},{' '}
              {formattaEuroIntero(p.daIncassare)} da incassare
              {p.saldiScaduti > 0 && (
                <>, di cui <span className="stat-negativo">{formattaNumero(p.saldiScaduti)}</span> con la scadenza passata</>
              )}
              .
            </p>
          )}
        </Scheda>
      </div>

      <Scheda
        titolo="Codici sconto"
        azione={(
          <BottoneCsv
            disabilitato={d.coupon.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv('codici sconto', d.periodo),
              ['Codice', 'Promoter', 'Usi', 'Passeggeri', 'Sconto €', 'Incasso €'],
              d.coupon.map((c) => [c.codice, c.promoterNome, c.usi, c.passeggeri, c.sconto, c.incasso]),
            )}
          />
        )}
      >
        {d.coupon.length === 0 ? <Vuoto>Nessun codice sconto usato nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Codice</th>
                  <th>Promoter</th>
                  <th className="stat-num">Usi</th>
                  <th className="stat-num">Passeggeri</th>
                  <th className="stat-num">Sconto</th>
                  <th className="stat-num">Incasso</th>
                </tr>
              </thead>
              <tbody>
                {d.coupon.map((c, k) => (
                  <tr key={`${c.codice}-${k}`}>
                    <td><span className="stat-codice stat-codice-principale">{c.codice}</span></td>
                    <td>{c.promoterNome ?? <span className="stat-spento">—</span>}</td>
                    <td className="stat-num">{formattaNumero(c.usi)}</td>
                    <td className="stat-num">{formattaNumero(c.passeggeri)}</td>
                    <td className="stat-num">{formattaEuro(c.sconto)}</td>
                    <td className="stat-num">{formattaEuroIntero(c.incasso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Scheda>

      <Scheda titolo="Offerte">
        {d.offerte.length === 0 ? <Vuoto>Nessuna offerta usata nel periodo.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Offerta</th>
                  <th>Evento</th>
                  <th className="stat-num">Prenotazioni</th>
                  <th className="stat-num">Passeggeri</th>
                  <th className="stat-num">Incasso</th>
                </tr>
              </thead>
              <tbody>
                {d.offerte.map((o) => (
                  <tr key={o.id}>
                    <td><b>{o.nome}</b></td>
                    <td>{o.eventoArtista}</td>
                    <td className="stat-num">{formattaNumero(o.prenotazioni)}</td>
                    <td className="stat-num">{formattaNumero(o.passeggeri)}</td>
                    <td className="stat-num">{formattaEuroIntero(o.incasso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Scheda>
    </>
  );
}
