import { useEffect, useMemo, useRef, useState } from 'react';
import type { Confronto, FiltroPeriodo } from '../../../api/statistiche';
import { PanelHead } from '../../shared/PanelHead';
import { Clienti } from './Clienti';
import { chiaveFiltro, ProtezioneErrori } from './comuni';
import { CostiFornitori } from './CostiFornitori';
import { EventiLinee } from './EventiLinee';
import { Panoramica } from './Panoramica';
import {
  aggiungiGiorni, erroreIntervallo, leggiPreferenze, oggiRoma, OPZIONI_CONFRONTO, periodoDaPreset, PRESET_PERIODO,
  salvaPreferenze, testoPeriodo, type InfoPeriodo, type PresetPeriodo,
} from './periodo';
import { VenditeCanali } from './VenditeCanali';

type IdScheda = 'panoramica' | 'eventi' | 'vendite' | 'clienti' | 'costi';

const SCHEDE: { id: IdScheda; etichetta: string }[] = [
  { id: 'panoramica', etichetta: 'Panoramica' },
  { id: 'eventi', etichetta: 'Eventi e linee' },
  { id: 'vendite', etichetta: 'Vendite e canali' },
  { id: 'clienti', etichetta: 'Clienti' },
  { id: 'costi', etichetta: 'Costi e fornitori' },
];

/** Solo queste schede mostrano un confronto: le altre non hanno il menu
 *  "Confronto" e chiedono sempre "nessuno" (cambiarlo non le ricarica). */
const SCHEDE_CON_CONFRONTO: IdScheda[] = ['panoramica', 'clienti'];

/** Pausa prima di mostrare (e far leggere) l'errore delle date personalizzate. */
const ATTESA_ERRORE_DATE_MS = 800;

/** Sezione Statistiche del gestionale: cinque schede con lo stesso filtro del
 *  periodo. Ogni scheda carica i propri dati; scheda e filtro scelti restano
 *  ricordati nel browser. */
export function StatisticheScreen() {
  const oggi = oggiRoma();
  const [preferenze] = useState(leggiPreferenze);
  const [scheda, setScheda] = useState<IdScheda>(() => SCHEDE.find((s) => s.id === preferenze.scheda)?.id ?? 'panoramica');
  const [preset, setPreset] = useState<PresetPeriodo>(preferenze.preset ?? 'ultimi-30');
  const [dalScelto, setDalScelto] = useState(preferenze.dal ?? aggiungiGiorni(oggi, -29));
  const [alScelto, setAlScelto] = useState(preferenze.al ?? oggi);
  const [confronto, setConfronto] = useState<Confronto>(preferenze.confronto ?? 'anno');
  const [infoPeriodo, setInfoPeriodo] = useState<InfoPeriodo>(null);

  const personalizzato = preset === 'personalizzato';
  const erroreDate = personalizzato ? erroreIntervallo(dalScelto, alScelto) : null;
  const scelto = personalizzato ? { dal: dalScelto, al: alScelto } : periodoDaPreset(preset, oggi);
  // Con date personalizzate non valide le schede restano sull'ultimo periodo valido.
  const ultimoValido = useRef(erroreDate ? periodoDaPreset('ultimi-30', oggi) : scelto);
  if (!erroreDate) ultimoValido.current = scelto;
  const { dal, al } = ultimoValido.current;
  const filtroConConfronto = useMemo<FiltroPeriodo>(() => ({ dal, al, confronto }), [dal, al, confronto]);
  const filtroSenzaConfronto = useMemo<FiltroPeriodo>(() => ({ dal, al, confronto: 'nessuno' }), [dal, al]);
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
    salvaPreferenze({ scheda, preset, dal: dalScelto, al: alScelto, confronto });
  }, [scheda, preset, dalScelto, alScelto, confronto]);

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

  return (
    <div>
      <PanelHead
        titolo="Statistiche"
        info="Contano solo le prenotazioni confermate. Gli eventi in bozza o nel cestino non entrano nei conti. Un acconto non ancora saldato conta già per il prezzo intero."
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
            <span>Confronto</span>
            <select value={confronto} onChange={(e) => setConfronto(e.target.value as Confronto)}>
              {OPZIONI_CONFRONTO.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}
            </select>
          </label>
        )}
        {testoInfo && <p className="stat-periodo">{testoInfo}</p>}
      </div>
      <p className="stat-errore-date" aria-live="polite">{personalizzato ? erroreDateMostrato : null}</p>

      <ProtezioneErrori chiave={`${scheda}|${chiaveFiltro(filtro)}`}>
        {scheda === 'panoramica' && <Panoramica filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'eventi' && <EventiLinee filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'vendite' && <VenditeCanali filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'clienti' && <Clienti filtro={filtro} onPeriodo={setInfoPeriodo} />}
        {scheda === 'costi' && <CostiFornitori filtro={filtro} onPeriodo={setInfoPeriodo} />}
      </ProtezioneErrori>
    </div>
  );
}
