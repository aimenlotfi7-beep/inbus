import { useState } from 'react';
import {
  statisticheApi,
  type AvvisoStatistiche, type Confronto, type GravitaAvviso, type StatistichePanoramica,
} from '../../../api/statistiche';
import { haPermesso } from '../../../api/auth';
import { formattaEuro } from '../../../shared/formato';
import { useNavigazione } from '../../shared/NavigazioneContext';
import { PERMESSO_SEZIONE } from '../../shared/permessiSezioni';
import { useSessione } from '../../shared/SessioneContext';
import {
  chiaveFiltro, ErroreStatistiche, ETICHETTA_FONTE, formattaEuroIntero, formattaNumero, formattaPercentuale,
  GrigliaKpi, Kpi, NotaCostiMancanti, Scheda, useDati, useSegnalaPeriodo, Variazione, VariazionePunti, Vuoto,
  type PropsScheda, type StatoDati,
} from './comuni';
import { BarraProiettile, BarreOrizzontali, GraficoAndamento } from './grafici';
import { OPZIONI_CONFRONTO } from './periodo';

const NOME_GRAVITA: Record<GravitaAvviso, string> = { urgente: 'Urgente', critico: 'Critico', attenzione: 'Attenzione' };
const AVVISI_IN_VISTA = 6;

export function Panoramica({ filtro, onPeriodo }: PropsScheda) {
  // Il confronto viaggia insieme ai dati: mentre arriva un filtro nuovo, i nomi
  // nel grafico restano quelli dei dati ancora a schermo.
  const stato = useDati(
    async () => ({ risposta: await statisticheApi.panoramica(filtro), confronto: filtro.confronto }),
    chiaveFiltro(filtro),
  );
  // "Da guardare adesso" non dipende dal periodo: si carica una volta sola.
  const avvisi = useDati(() => statisticheApi.daGuardare(), 'da-guardare');
  useSegnalaPeriodo(stato.dati && !stato.caricando ? stato.dati.risposta.periodo : null, onPeriodo);

  if (!stato.dati) {
    return (
      <>
        {stato.errore
          ? <ErroreStatistiche motivo={stato.errore.motivo} onRiprova={stato.riprova} />
          : <p className="testo-intro">Carico…</p>}
        <DaGuardare stato={avvisi} />
      </>
    );
  }
  return (
    <ContenutoPanoramica
      d={stato.dati.risposta}
      confronto={stato.dati.confronto}
      aggiorno={stato.caricando}
      avvisi={avvisi}
    />
  );
}

function ContenutoPanoramica({ d, confronto, aggiorno, avvisi }: {
  d: StatistichePanoramica;
  /** Il confronto con cui sono stati caricati questi dati. */
  confronto: Confronto;
  aggiorno: boolean;
  avvisi: StatoDati<AvvisoStatistiche[]>;
}) {
  const v = d.vendite;
  const e = d.eventiDelPeriodo;
  const attenuato = aggiorno ? 'stat-aggiorno' : undefined;

  const n = Math.min(d.periodo.intervalli.length, v.andamento.length);
  const etichette = d.periodo.intervalli.slice(0, n).map((x) => x.etichetta);
  const attuale = v.andamento.slice(0, n).map((p) => p.attuale);
  const precedente = confronto === 'nessuno' ? null : v.andamento.slice(0, n).map((p) => p.precedente);
  const conPrecedente = (precedente ?? []).some((x) => x !== null);
  const nomeConfronto = OPZIONI_CONFRONTO.find((c) => c.id === confronto)?.etichetta ?? '';
  const totale = attuale.reduce((s, x) => s + x, 0);
  const totalePrecedente = (precedente ?? []).reduce<number>((s, x) => s + (x ?? 0), 0);
  const iMassimo = attuale.reduce((m, x, k) => (x > attuale[m] ? k : m), 0);
  const descrizione = n === 0
    ? 'Passeggeri venduti: nessun dato nel periodo.'
    : `Passeggeri venduti per ${d.periodo.granularita} da ${etichette[0]} a ${etichette[n - 1]}: `
      + `${formattaNumero(totale)} in tutto, al massimo ${formattaNumero(attuale[iMassimo])} (${etichette[iMassimo]})`
      + `${conPrecedente ? `; nel confronto ${formattaNumero(totalePrecedente)} in tutto` : ''}.`;

  const riempimento = e.riempimentoBus;

  return (
    <>
      <div className={attenuato} aria-busy={aggiorno}>
        <p className="section-label">Vendite nel periodo · per data d'acquisto</p>
        <GrigliaKpi>
          <Kpi etichetta="Passeggeri" valore={formattaNumero(v.passeggeri.attuale)}>
            <Variazione valore={v.passeggeri} formatta={formattaNumero} />
          </Kpi>
          <Kpi etichetta="Prenotazioni" valore={formattaNumero(v.prenotazioni.attuale)}>
            <Variazione valore={v.prenotazioni} formatta={formattaNumero} />
          </Kpi>
          <Kpi etichetta="Incasso" valore={formattaEuroIntero(v.incasso.attuale)}>
            <Variazione valore={v.incasso} formatta={formattaEuroIntero} />
          </Kpi>
          <Kpi etichetta="Incasso per passeggero" valore={formattaEuro(v.ricavoPerPasseggero.attuale)}>
            <Variazione valore={v.ricavoPerPasseggero} formatta={formattaEuro} />
          </Kpi>
        </GrigliaKpi>
      </div>

      <div className="stat-due-colonne">
        <Scheda titolo="Passeggeri venduti" classe={attenuato}>
          <GraficoAndamento
            etichette={etichette}
            attuale={attuale}
            precedente={precedente}
            nomeAttuale="Periodo scelto"
            nomePrecedente={nomeConfronto}
            ariaLabel={descrizione}
          />
        </Scheda>
        <DaGuardare stato={avvisi} />
      </div>

      <Scheda titolo="Incasso per fonte" classe={attenuato}>
        <BarreOrizzontali
          ariaLabel="Incasso per fonte, per data d'acquisto"
          righe={d.perFonte.map((r, k) => ({
            chiave: `${r.tipo}-${k}`,
            etichetta: ETICHETTA_FONTE[r.tipo],
            valore: r.incasso,
            testo: formattaEuroIntero(r.incasso),
          }))}
        />
      </Scheda>

      <div className={attenuato} aria-busy={aggiorno}>
        <p className="section-label stat-titoletto">Eventi del periodo · per data dell'evento</p>
        <GrigliaKpi>
          <Kpi etichetta="Eventi" valore={formattaNumero(e.eventi.attuale)}>
            <Variazione valore={e.eventi} formatta={formattaNumero} />
          </Kpi>
          <Kpi etichetta="Passeggeri" valore={formattaNumero(e.passeggeri.attuale)}>
            <Variazione valore={e.passeggeri} formatta={formattaNumero} />
          </Kpi>
          <Kpi etichetta="Incasso" valore={formattaEuroIntero(e.incasso.attuale)}>
            <Variazione valore={e.incasso} formatta={formattaEuroIntero} />
          </Kpi>
          <Kpi
            etichetta="Riempimento dei bus"
            valore={riempimento.attuale === null ? 'Nessun bus nel periodo' : formattaPercentuale(riempimento.attuale)}
            tono={riempimento.attuale === null ? 'spento' : undefined}
          >
            {riempimento.attuale !== null && (
              <BarraProiettile
                valore={riempimento.attuale}
                confronto={riempimento.precedente}
                ariaLabel={`Riempimento dei bus ${formattaPercentuale(riempimento.attuale)}${riempimento.precedente !== null ? `, nel confronto ${formattaPercentuale(riempimento.precedente)}` : ''}`}
              />
            )}
            {riempimento.precedente !== null && (riempimento.attuale !== null
              ? <VariazionePunti attuale={riempimento.attuale} precedente={riempimento.precedente} />
              : <div className="stat-variazione">prima: {formattaPercentuale(riempimento.precedente)}</div>)}
          </Kpi>
          <Kpi etichetta="Costo dei bus" valore={formattaEuroIntero(e.costoBus.attuale)}>
            <Variazione valore={e.costoBus} formatta={formattaEuroIntero} neutra />
          </Kpi>
          <Kpi etichetta="Commissioni" valore={formattaEuroIntero(e.commissioni.attuale)}>
            <Variazione valore={e.commissioni} formatta={formattaEuroIntero} neutra />
          </Kpi>
          <Kpi etichetta="Margine" valore={formattaEuroIntero(e.margine.attuale)} tono={e.margine.attuale < 0 ? 'negativo' : undefined}>
            <Variazione valore={e.margine} formatta={formattaEuroIntero} />
          </Kpi>
        </GrigliaKpi>
        <NotaCostiMancanti eventi={e.eventiConCostiMancanti} />
      </div>
    </>
  );
}

function DaGuardare({ stato }: { stato: StatoDati<AvvisoStatistiche[]> }) {
  const naviga = useNavigazione();
  const sessione = useSessione();
  const [tutti, setTutti] = useState(false);
  // Già in ordine dal server (gravità, poi data dell'evento).
  const avvisi = stato.dati ?? [];
  const visibili = tutti ? avvisi : avvisi.slice(0, AVVISI_IN_VISTA);

  return (
    <Scheda titolo="Da guardare adesso" conteggio={stato.dati ? avvisi.length : undefined}>
      {stato.errore ? (
        <ErroreStatistiche motivo={stato.errore.motivo} onRiprova={stato.riprova} dentroScheda />
      ) : !stato.dati ? (
        <p className="testo-intro">Carico…</p>
      ) : avvisi.length === 0 ? (
        <Vuoto>Niente da segnalare adesso.</Vuoto>
      ) : (
        <>
          <ul className="stat-avvisi">
            {visibili.map((a, k) => (
              <li key={`${a.tipo}-${a.eventoId ?? ''}-${k}`} className={`stat-avviso ${a.gravita}`}>
                <div className="stat-avviso-testo">
                  <span className="stat-solo-lettori">{NOME_GRAVITA[a.gravita]}: </span>
                  <b>{a.titolo}</b>
                  {a.dettaglio && <span className="stat-avviso-dettaglio">{a.dettaglio}</span>}
                </div>
                {haPermesso(sessione, PERMESSO_SEZIONE[a.sezione]) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-piccolo"
                    aria-label={`Apri: ${a.titolo}`}
                    onClick={() => naviga(a.sezione)}
                  >
                    Apri →
                  </button>
                )}
              </li>
            ))}
          </ul>
          {avvisi.length > AVVISI_IN_VISTA && (
            <button type="button" className="btn btn-ghost btn-piccolo stat-altri" onClick={() => setTutti((t) => !t)}>
              {tutti ? 'Mostra meno' : `Mostra tutti (${avvisi.length})`}
            </button>
          )}
        </>
      )}
    </Scheda>
  );
}
