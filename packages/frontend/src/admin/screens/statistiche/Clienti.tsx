import { statisticheApi, type StatisticheClienti } from '../../../api/statistiche';
import { plurale } from '../../../shared/formato';
import {
  Caricamento, chiaveFiltro, formattaNumero, formattaPercentuale, GrigliaKpi, Kpi, KpiExtra, pluraleNumero, Scheda,
  useDati, useSegnalaPeriodo, Variazione, Vuoto, type PropsScheda,
} from './comuni';
import { BarraDivisa, BarreOrizzontali, Colonne } from './grafici';

export function Clienti({ filtro, onPeriodo }: PropsScheda) {
  const stato = useDati(() => statisticheApi.clienti(filtro), chiaveFiltro(filtro));
  useSegnalaPeriodo(stato.dati && !stato.caricando ? stato.dati.periodo : null, onPeriodo);
  return <Caricamento stato={stato}>{(d) => <ContenutoClienti d={d} />}</Caricamento>;
}

function ContenutoClienti({ d }: { d: StatisticheClienti }) {
  const quotaRitorno = d.clienti.attuale > 0 ? (d.diRitorno.attuale / d.clienti.attuale) * 100 : null;
  const conDatiAccount = d.ospiti + d.conAccount;
  const quotaOspiti = conDatiAccount > 0 ? (d.ospiti / conDatiAccount) * 100 : null;
  const totaleFermate = d.fermate.reduce((s, f) => s + f.passeggeri, 0) + d.altreFermate.passeggeri;
  const maxRitorno = Math.max(0, ...d.coorti.flatMap((c) => c.ritorno.filter((v): v is number => v !== null)));

  return (
    <>
      <GrigliaKpi>
        <Kpi etichetta="Clienti" valore={formattaNumero(d.clienti.attuale)}>
          <Variazione valore={d.clienti} formatta={formattaNumero} />
        </Kpi>
        <Kpi etichetta="Nuovi" valore={formattaNumero(d.nuovi.attuale)}>
          <Variazione valore={d.nuovi} formatta={formattaNumero} />
        </Kpi>
        <Kpi etichetta="Di ritorno" valore={formattaNumero(d.diRitorno.attuale)}>
          {quotaRitorno !== null && <KpiExtra>{formattaPercentuale(quotaRitorno)} dei clienti</KpiExtra>}
          <Variazione valore={d.diRitorno} formatta={formattaNumero} />
        </Kpi>
        <Kpi etichetta="Senza account" valore={quotaOspiti === null ? '—' : formattaPercentuale(quotaOspiti)}>
          {conDatiAccount > 0 && <KpiExtra>{pluraleNumero(d.ospiti, 'ospite', 'ospiti')} su {formattaNumero(conDatiAccount)}</KpiExtra>}
        </Kpi>
        <Kpi etichetta="Arrivati con un invito" valore={formattaNumero(d.invitati)} />
      </GrigliaKpi>

      <div className="stat-due-colonne stat-uguali">
        <Scheda titolo="Fasce d'età">
          {d.eta === null ? (
            <Vuoto>Servono almeno 10 clienti con la data di nascita per mostrare le fasce.</Vuoto>
          ) : (
            <Colonne
              dati={d.eta.map((f) => ({ etichetta: f.fascia, valore: f.percentuale, testo: formattaPercentuale(f.percentuale) }))}
              ariaLabel={`Clienti per fascia d'età: ${d.eta.map((f) => `${f.fascia} ${formattaPercentuale(f.percentuale)}`).join(', ')}`}
            />
          )}
          <p className="stat-didascalia">
            Età di chi prenota il giorno dell'evento · {formattaNumero(d.etaNonIndicata)} senza data di nascita.
          </p>
        </Scheda>

        <Scheda titolo="Nuovi e di ritorno">
          <BarraDivisa
            titolo="Clienti del periodo"
            parti={[
              { etichetta: 'Nuovi', valore: d.nuovi.attuale },
              { etichetta: 'Di ritorno', valore: d.diRitorno.attuale },
            ]}
          />
          {d.coorti.length === 0 ? (
            <p className="stat-testo stat-spento">Nessun cliente nuovo negli ultimi 12 mesi.</p>
          ) : (
            <div className="table-scroll stat-spazio-sopra">
              <table className="data-table stat-compatta">
                <thead>
                  <tr>
                    <th>Mese</th>
                    <th className="stat-num">Clienti</th>
                    {d.mesiCoorti.map((m, k) => (
                      <th key={m} className="stat-num">{k === 0 ? `entro ${plurale(m, 'mese', 'mesi')}` : plurale(m, 'mese', 'mesi')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.coorti.map((c) => (
                    <tr key={c.mese}>
                      <td className="stat-senza-a-capo">{c.etichetta}</td>
                      <td className="stat-num">{formattaNumero(c.clienti)}</td>
                      {d.mesiCoorti.map((m, k) => {
                        const valore = c.ritorno[k] ?? null;
                        const sfondo = valore !== null && maxRitorno > 0
                          ? { background: `color-mix(in srgb, var(--blue) ${Math.round((valore / maxRitorno) * 45)}%, transparent)` }
                          : undefined;
                        return (
                          <td key={m} className="stat-cella-coorte" style={sfondo}>
                            {valore === null ? <span className="stat-spento">—</span> : formattaPercentuale(valore)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="stat-didascalia">Ultimi 12 mesi, per mese della prima prenotazione: quanti hanno prenotato di nuovo.</p>
        </Scheda>
      </div>

      <Scheda titolo="Fermate più richieste">
        <BarreOrizzontali
          ariaLabel="Passeggeri per città della fermata"
          totale={totaleFermate}
          righe={d.fermate.map((f) => ({
            chiave: f.citta,
            etichetta: f.citta,
            valore: f.passeggeri,
            testo: pluraleNumero(f.passeggeri, 'passeggero', 'passeggeri'),
          }))}
        />
        {d.altreFermate.numero > 0 && (
          <p className="stat-didascalia">
            {d.altreFermate.numero === 1 ? "Un'altra fermata" : `Altre ${formattaNumero(d.altreFermate.numero)} fermate`}:{' '}
            {pluraleNumero(d.altreFermate.passeggeri, 'passeggero', 'passeggeri')}
          </p>
        )}
      </Scheda>
    </>
  );
}
