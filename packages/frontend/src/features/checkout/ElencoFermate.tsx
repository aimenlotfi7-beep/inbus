import { useId, useState, type ReactNode } from 'react';
import { formattaEuro, plurale } from '../../shared/formato';
import { Icona } from '../Icone';
import {
  REGIONE_ASSENTE, SOGLIA_ELENCO_LUNGO, fermatePiuVicine, filtraFermate, messaggioPosizione, ordinaPerOrario,
  raggruppaPerRegione, testoDistanza, usePosizione, type DatiFermata,
} from './regoleFermate';

/** Informazioni in più passate a chi disegna una fermata. */
export interface ExtraVoce {
  /** Elenco lungo: fermata su una riga (città, andata, prezzo), senza indirizzo e ritorno. */
  compatta: boolean;
  /** "a 12 km", solo in "Più vicine a te". */
  distanza?: string;
}

/** L'elenco delle fermate, uguale nella pagina evento e nel modulo di
 *  prenotazione; cambia solo come si disegna la singola fermata
 *  (pulsante "Scegli" in pagina, scelta a radio nel modulo).
 *
 *  Fino a SOGLIA_ELENCO_LUNGO fermate: elenco semplice per orario.
 *  Oltre: "Da dove parti?" (filtra mentre si scrive), "Usa la mia
 *  posizione" (le 3 più vicine in cima) e regioni chiuse, con numero di
 *  fermate e prezzo più basso; la regione della fermata scelta è aperta. */
export function ElencoFermate<T>({
  voci, dati, chiave, prezzo, selezionata, renderVoce, tagElenco = 'div', tagVoce = 'div', classeElenco,
}: {
  voci: T[];
  dati: (v: T) => DatiFermata;
  chiave: (v: T) => string;
  prezzo: (v: T) => number | null;
  /** chiave della fermata scelta: la sua regione parte aperta */
  selezionata?: string;
  renderVoce: (v: T, extra: ExtraVoce) => ReactNode;
  tagElenco?: 'ul' | 'div';
  tagVoce?: 'li' | 'div';
  classeElenco: string;
}) {
  const idBase = useId();
  const [ricerca, setRicerca] = useState('');
  const posizione = usePosizione();
  const lungo = voci.length > SOGLIA_ELENCO_LUNGO;

  const gruppi = raggruppaPerRegione(voci, dati);
  const regioneScelta = selezionata ? gruppi.find((g) => g.voci.some((v) => chiave(v) === selezionata))?.regione : undefined;
  const [aperte, setAperte] = useState<Set<string>>(() => new Set(regioneScelta ? [regioneScelta] : []));

  const Elenco = tagElenco;
  const Voce = tagVoce;
  const disegna = (elenco: T[], extra: (v: T) => ExtraVoce) => (
    <Elenco className={classeElenco}>
      {elenco.map((v) => <Voce key={chiave(v)}>{renderVoce(v, extra(v))}</Voce>)}
    </Elenco>
  );

  if (!lungo) return disegna(ordinaPerOrario(voci, dati), () => ({ compatta: false }));

  const testo = ricerca.trim();
  const trovate = testo ? ordinaPerOrario(filtraFermate(voci, testo, dati), dati) : [];
  const conCoordinate = voci.some((v) => dati(v).lat != null && dati(v).lng != null);
  const vicine = posizione.posizione ? fermatePiuVicine(voci, posizione.posizione, dati) : [];
  const chiaviVicine = new Set(vicine.map((x) => chiave(x.voce)));
  const distanze = new Map(vicine.map((x) => [chiave(x.voce), testoDistanza(x.km)]));
  // Senza regioni (nessuna fermata ce l'ha) i gruppi non aiutano: elenco unico.
  const senzaRegioni = gruppi.length === 1 && gruppi[0].regione === REGIONE_ASSENTE;
  const messaggio = messaggioPosizione(posizione.stato);

  function alterna(regione: string, aperta: boolean) {
    setAperte((prima) => {
      if (prima.has(regione) === aperta) return prima;
      const nuove = new Set(prima);
      if (aperta) nuove.add(regione); else nuove.delete(regione);
      return nuove;
    });
  }

  const prezzoMinimo = (elenco: T[]) => {
    const prezzi = elenco.map(prezzo).filter((p): p is number => p !== null);
    if (!prezzi.length) return null;
    const minimo = Math.min(...prezzi);
    return formattaEuro(minimo, { senzaDecimali: Number.isInteger(minimo) });
  };

  return (
    <div className="elenco-fermate">
      <div className="elenco-fermate-strumenti">
        <label className="campo-etichetta" htmlFor={`${idBase}-cerca`}>Da dove parti?</label>
        <div className="elenco-fermate-riga">
          <input
            id={`${idBase}-cerca`}
            className="campo-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Scrivi la tua città"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
          {conCoordinate && posizione.disponibile && (
            posizione.stato === 'trovata' ? (
              <button type="button" className="btn btn-tertiary btn-sm" onClick={posizione.annulla}>Togli posizione</button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={posizione.chiedi} disabled={posizione.stato === 'in-corso'}>
                <Icona nome="pin" dimensione={16} />Usa la mia posizione
              </button>
            )
          )}
        </div>
        {messaggio && <p className="campo-aiuto" role="status">{messaggio}</p>}
      </div>

      {testo ? (
        <>
          <p className="elenco-fermate-conteggio" role="status">
            {trovate.length ? plurale(trovate.length, 'fermata trovata', 'fermate trovate') : 'Nessuna fermata con questo nome: prova con una città vicina.'}
          </p>
          {trovate.length > 0 && disegna(trovate, (v) => ({ compatta: true, distanza: distanze.get(chiave(v)) }))}
        </>
      ) : (
        <>
          {vicine.length > 0 && (
            <div className="elenco-fermate-vicine">
              <p className="elenco-fermate-titolo">Più vicine a te</p>
              {disegna(vicine.map((x) => x.voce), (v) => ({ compatta: true, distanza: distanze.get(chiave(v)) }))}
            </div>
          )}
          {senzaRegioni ? (
            disegna(ordinaPerOrario(voci.filter((v) => !chiaviVicine.has(chiave(v))), dati), () => ({ compatta: true }))
          ) : (
            <div className="elenco-fermate-regioni">
              {vicine.length > 0 && <p className="elenco-fermate-titolo">Tutte le altre fermate</p>}
              {gruppi.map((g) => {
                const elenco = g.voci.filter((v) => !chiaviVicine.has(chiave(v)));
                if (!elenco.length) return null;
                const minimo = prezzoMinimo(elenco);
                return (
                  <details
                    key={g.regione}
                    className="elenco-fermate-regione"
                    open={aperte.has(g.regione)}
                    onToggle={(e) => alterna(g.regione, (e.currentTarget as HTMLDetailsElement).open)}
                  >
                    <summary>
                      <span className="elenco-fermate-regione-nome">{g.regione}</span>
                      <span className="elenco-fermate-regione-meta">
                        {plurale(elenco.length, 'fermata', 'fermate')}{minimo ? ` · da ${minimo}` : ''}
                      </span>
                      <Icona nome="freccia" dimensione={16} className="elenco-fermate-regione-freccia" />
                    </summary>
                    {disegna(elenco, () => ({ compatta: true }))}
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
