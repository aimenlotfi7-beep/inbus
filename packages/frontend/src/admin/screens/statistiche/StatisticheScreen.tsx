import { useEffect, useMemo, useRef, useState } from 'react';
import type { Confronto as TipoConfronto, FiltroEventi, FiltroPeriodo } from '../../../api/statistiche';
import { PanelHead } from '../../shared/PanelHead';
import { BusInPiu } from './BusInPiu';
import { Clienti } from './Clienti';
import { chiaveFiltro, chiaveFiltroEventi, ProtezioneErrori } from './comuni';
import { Confronto } from './Confronto';
import { CostiFornitori } from './CostiFornitori';
import { EventiLinee } from './EventiLinee';
import { FiltriEventi, filtriAttivi, testoFiltri, useOpzioniFiltri } from './FiltriEventi';
import { Panoramica } from './Panoramica';
import {
  aggiungiGiorni, erroreIntervallo, leggiPreferenze, oggiRoma, OPZIONI_CONFRONTO, periodoDaPreset, PRESET_PERIODO,
  salvaPreferenze, testoPeriodo, type InfoPeriodo, type PresetPeriodo,
} from './periodo';
import { VenditeCanali } from './VenditeCanali';

type IdScheda = 'panoramica' | 'confronto' | 'eventi' | 'vendite' | 'clienti' | 'costi' | 'bus-in-piu';

/** Ogni scheda dice in una riga a cosa risponde e quale data conta per il
 *  periodo (proprietario, ottobre 2026: «rendila più chiara possibile»). */
const SCHEDE: { id: IdScheda; etichetta: string; descrizione: string }[] = [
  { id: 'panoramica', etichetta: 'Panoramica', descrizione: "Il riassunto: quanto hai venduto nel periodo e come sono andati gli eventi del periodo." },
  { id: 'confronto', etichetta: 'Confronto', descrizione: "Gli eventi del periodo divisi per categoria, genere, città, tour o mese: dove guadagni di più. Conta la data dell'evento." },
  { id: 'eventi', etichetta: 'Eventi e linee', descrizione: "Ogni evento con passeggeri, bus e margine: quelli in vendita e quelli passati nel periodo. Apri un evento per linee, fermate e ritmo di vendita." },
  { id: 'vendite', etichetta: 'Vendite e canali', descrizione: "Da dove arrivano le vendite: sito, promoter, White Label, campagne, codici sconto e offerte. Conta la data d'acquisto." },
  { id: 'clienti', etichetta: 'Clienti', descrizione: "Chi prenota: nuovi o di ritorno, età e fermate più richieste. Conta la data d'acquisto." },
  { id: 'costi', etichetta: 'Costi e fornitori', descrizione: "Quanto costano gli eventi del periodo: bus, commissioni, fornitori, cancellazioni e rimborsi. Conta la data dell'evento." },
  { id: 'bus-in-piu', etichetta: 'Bus in più', descrizione: "Quanto rendono i bus: prova a farne partire uno in più o in meno e guarda il risultato. Si sceglie l'anno, non il periodo." },
];

/** Bus in più ha il suo filtro (l'anno): niente periodo. */
const SCHEDE_SENZA_PERIODO: IdScheda[] = ['bus-in-piu'];

/** Solo queste schede mostrano un confronto: le altre non hanno il menu
 *  "Confronto" e chiedono sempre "nessuno" (cambiarlo non le ricarica). */
const SCHEDE_CON_CONFRONTO: IdScheda[] = ['panoramica', 'clienti'];

/** Pausa prima di mostrare (e far leggere) l'errore delle date personalizzate. */
const ATTESA_ERRORE_DATE_MS = 800;

/** Sezione Statistiche del gestionale: sette schede con gli stessi filtri
 *  (periodo e quali eventi). Ogni scheda carica i propri dati; scheda e
 *  filtri scelti restano ricordati nel browser. */
export function StatisticheScreen() {
  const oggi = oggiRoma();
  const [preferenze] = useState(leggiPreferenze);
  const [scheda, setScheda] = useState<IdScheda>(() => SCHEDE.find((s) => s.id === preferenze.scheda)?.id ?? 'panoramica');
  const [preset, setPreset] = useState<PresetPeriodo>(preferenze.preset ?? 'ultimi-30');
  const [dalScelto, setDalScelto] = useState(preferenze.dal ?? aggiungiGiorni(oggi, -29));
  const [alScelto, setAlScelto] = useState(preferenze.al ?? oggi);
  const [confronto, setConfronto] = useState<TipoConfronto>(preferenze.confronto ?? 'anno');
  const [filtroEventi, setFiltroEventi] = useState<FiltroEventi>(preferenze.eventi ?? {});
  const [infoPeriodo, setInfoPeriodo] = useState<InfoPeriodo>(null);
  const opzioni = useOpzioniFiltri();

  const personalizzato = preset === 'personalizzato';
  const erroreDate = personalizzato ? erroreIntervallo(dalScelto, alScelto) : null;
  const scelto = personalizzato ? { dal: dalScelto, al: alScelto } : periodoDaPreset(preset, oggi);
  // Con date personalizzate non valide le schede restano sull'ultimo periodo valido.
  const ultimoValido = useRef(erroreDate ? periodoDaPreset('ultimi-30', oggi) : scelto);
  if (!erroreDate) ultimoValido.current = scelto;
  const { dal, al } = ultimoValido.current;
  const chiaveEventi = chiaveFiltroEventi(filtroEventi);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eventi = useMemo(() => filtroEventi, [chiaveEventi]);
  const filtroConConfronto = useMemo<FiltroPeriodo>(() => ({ dal, al, confronto, eventi }), [dal, al, confronto, eventi]);
  const filtroSenzaConfronto = useMemo<FiltroPeriodo>(() => ({ dal, al, confronto: 'nessuno', eventi }), [dal, al, eventi]);
  const usaConfronto = SCHEDE_CON_CONFRONTO.includes(scheda);
  const filtro = usaConfronto ? filtroConConfronto : filtroSenzaConfronto;

  // L'errore delle date compare quando si smette di scrivere, non a ogni tasto;
  // quando le date tornano valide sparisce subito.
  const [erroreDateMostrato, setErroreDateMostrato] = useState<string | null>(null);
  useEffect(() => {
    if (!erroreDate) {
      setErroreDateMostrato(null);
      return undefined;
    }
    const attesa = window.setTimeout(() => setErroreDateMostrato(erroreDate), ATTESA_ERRORE_DATE_MS);
    return () => window.clearTimeout(attesa);
  }, [erroreDate]);

  useEffect(() => {
    salvaPreferenze({ scheda, preset, dal: dalScelto, al: alScelto, confronto, eventi: filtroEventi });
  }, [scheda, preset, dalScelto, alScelto, confronto, filtroEventi]);

  function cambiaScheda(id: IdScheda) {
    if (id === scheda) return;
    setInfoPeriodo(null);
    setScheda(id);
  }

  function cambiaPreset(nuovo: PresetPeriodo) {
    // Passando a "Personalizzato" si parte dal periodo che si stava guardando.
    if (nuovo === 'personalizzato' && !personalizzato) {
      setDalScelto(filtro.dal);
      setAlScelto(filtro.al);
    }
    setPreset(nuovo);
  }

  const testoInfo = infoPeriodo === null
    ? ''
    : infoPeriodo === 'non-applicabile'
      ? "La scheda dell'evento non dipende dal periodo."
      : testoPeriodo(infoPeriodo);
  const descrizione = SCHEDE.find((s) => s.id === scheda)!.descrizione;
  const conFiltri = filtriAttivi(filtroEventi);

  return (
    <div>
      <PanelHead
        titolo="Statistiche"
        info="Contano solo le prenotazioni confermate. Gli eventi in bozza o nel cestino non entrano nei conti. «Previsto» è il valore delle prenotazioni: un acconto non ancora saldato conta già per il prezzo intero. «Incassato» è quanto è stato pagato davvero. Il margine previsto usa il previsto, quello «a oggi» l'incassato."
      />

      <div className="mini-tabs">
        {SCHEDE.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`mini-tab${scheda === s.id ? ' active' : ''}`}
            aria-pressed={scheda === s.id}
            onClick={() => cambiaScheda(s.id)}
          >
            {s.etichetta}
          </button>
        ))}
      </div>
      <p className="stat-descrizione">{descrizione}</p>

      <div className="stat-filtri-riquadro">
        {!SCHEDE_SENZA_PERIODO.includes(scheda) && (
          <>
            <div className="stat-filtri">
              <label className="stat-campo">
                <span>Periodo</span>
                <select value={preset} onChange={(e) => cambiaPreset(e.target.value as PresetPeriodo)}>
                  {PRESET_PERIODO.map((p) => <option key={p.id} value={p.id}>{p.etichetta}</option>)}
                </select>
              </label>
              {personalizzato && (
                <>
                  <label className="stat-campo">
                    <span>Dal</span>
                    <input type="date" value={dalScelto} onChange={(e) => setDalScelto(e.target.value)} />
                  </label>
                  <label className="stat-campo">
                    <span>Al</span>
                    <input type="date" value={alScelto} min={dalScelto || undefined} onChange={(e) => setAlScelto(e.target.value)} />
                  </label>
                </>
              )}
              {usaConfronto && (
                <label className="stat-campo">
                  <span>Confronta con</span>
                  <select value={confronto} onChange={(e) => setConfronto(e.target.value as TipoConfronto)}>
                    {OPZIONI_CONFRONTO.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}
                  </select>
                </label>
              )}
              {testoInfo && <p className="stat-periodo">{testoInfo}</p>}
            </div>
            <p className="stat-errore-date" aria-live="polite">{personalizzato ? erroreDateMostrato : null}</p>
          </>
        )}
        <FiltriEventi valore={filtroEventi} opzioni={opzioni.dati} onCambia={setFiltroEventi} />
        {conFiltri && (
          <p className="stat-filtri-attivi">
            <span>Stai guardando solo: <b>{testoFiltri(filtroEventi, opzioni.dati)}</b></span>
            <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => setFiltroEventi({})}>Togli i filtri</button>
          </p>
        )}
      </div>

      <ProtezioneErrori chiave={`${scheda}|${chiaveFiltro(filtro)}`}>
        {scheda === 'panoramica' && <Panoramica filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'confronto' && <Confronto filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'eventi' && <EventiLinee filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'vendite' && <VenditeCanali filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'clienti' && <Clienti filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'costi' && <CostiFornitori filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'bus-in-piu' && <BusInPiu filtroEventi={eventi} />}
      </ProtezioneErrori>
    </div>
  );
}
