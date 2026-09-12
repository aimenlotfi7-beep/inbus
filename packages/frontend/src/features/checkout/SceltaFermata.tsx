import { useId, useState } from 'react';
import type { OpzionePartenza } from '../../api/types';
import { applicaScontoOfferta } from '../../api/prezzi';
import { formattaEuro } from '../../shared/formato';
import { Icona } from '../Icone';

/** Fino a questa soglia i posti si dicono "pochi" — stessa regola di
 *  PercorsoBus e della sezione Partenze della pagina evento. */
const SOGLIA_POCHI_POSTI = 5;
/** Da qui in su compare il campo "Cerca città" sopra l'elenco. */
const SOGLIA_RICERCA = 8;

/** Ordinate per regione (alfabetico, quelle senza regione in fondo) e
 *  poi per città — come Fornitori e Fermate nel gestionale. */
export function ordinaOpzioni(opzioni: OpzionePartenza[]): OpzionePartenza[] {
  return [...opzioni].sort((a, b) => {
    const ra = a.fermataRegione ?? 'zzz', rb = b.fermataRegione ?? 'zzz';
    if (ra !== rb) return ra.localeCompare(rb, 'it');
    return a.fermataCitta.localeCompare(b.fermataCitta, 'it');
  });
}

export function EtichettaPosti({ posti }: { posti: number }) {
  if (posti === 0) return <span className="fermata-posti esaurito">Esaurito · lista d'attesa</span>;
  if (posti <= SOGLIA_POCHI_POSTI) return <span className="fermata-posti pochi">Pochi posti</span>;
  return <span className="fermata-posti ok">Posti disponibili</span>;
}

/** La scelta della fermata di partenza: un gruppo di radio (nativi,
 *  nascosti alla vista ma non alla tastiera né allo screen reader) dove
 *  ogni opzione è una card con città, prezzo, indirizzo, orari di andata
 *  e ritorno e disponibilità. Le fermate esaurite restano selezionabili:
 *  portano alla lista d'attesa. Sostituisce il menu a tendina
 *  (SelettoreFermata, che resta in uso nel flusso dei bundle). */
export function SceltaFermata({ opzioni, valore, onSeleziona, offerta, legenda = 'Fermata di partenza' }: {
  opzioni: OpzionePartenza[];
  valore: string;
  onSeleziona: (fermataId: string) => void;
  offerta?: { scontoPercentuale: number };
  legenda?: string;
}) {
  const nomeGruppo = useId();
  const [ricerca, setRicerca] = useState('');
  const ordinate = ordinaOpzioni(opzioni);
  const conRicerca = opzioni.length > SOGLIA_RICERCA;
  const testo = ricerca.trim().toLowerCase();
  const filtrate = conRicerca && testo ? ordinate.filter((o) => o.fermataCitta.toLowerCase().includes(testo)) : ordinate;
  // Intestazioni di regione solo se almeno una fermata ce l'ha; le
  // altre finiscono sotto "Altre fermate".
  const almenoUnaRegione = ordinate.some((o) => !!o.fermataRegione);

  return (
    <fieldset className="fermate">
      <legend className="campo-etichetta">{legenda}</legend>
      {conRicerca && (
        <div className="campo fermate-ricerca">
          <label className="campo-etichetta" htmlFor={`${nomeGruppo}-cerca`}>Cerca città</label>
          <input
            id={`${nomeGruppo}-cerca`}
            className="campo-input"
            type="search"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Es. Bologna"
            autoComplete="off"
          />
        </div>
      )}
      {filtrate.length === 0 && <p className="campo-aiuto">Nessuna fermata con questo nome.</p>}
      <div className="fermate-elenco">
        {filtrate.map((o, i) => {
          const regione = o.fermataRegione ?? 'Altre fermate';
          const regionePrecedente = i > 0 ? (filtrate[i - 1].fermataRegione ?? 'Altre fermate') : null;
          const nuovaRegione = almenoUnaRegione && regione !== regionePrecedente;
          const prezzo = offerta ? applicaScontoOfferta(o.prezzoEffettivo, offerta.scontoPercentuale) : o.prezzoEffettivo;
          const selezionata = o.fermataId === valore;
          return (
            <div key={o.fermataId} className="fermate-voce">
              {nuovaRegione && <p className="fermate-gruppo">{regione}</p>}
              <label className={`fermata-opzione${selezionata ? ' selezionata' : ''}`}>
                <input
                  type="radio"
                  name={nomeGruppo}
                  value={o.fermataId}
                  checked={selezionata}
                  onChange={() => onSeleziona(o.fermataId)}
                />
                <span className="fermata-citta">{o.fermataCitta}</span>
                <span className="fermata-prezzo">
                  {formattaEuro(prezzo, { senzaDecimali: Number.isInteger(prezzo) })}
                  {offerta && <small> invece di {formattaEuro(o.prezzoEffettivo, { senzaDecimali: Number.isInteger(o.prezzoEffettivo) })}</small>}
                </span>
                {o.fermataIndirizzo && <span className="fermata-indirizzo">{o.fermataIndirizzo}</span>}
                <span className="fermata-orari">
                  <Icona nome="orologio" dimensione={14} />
                  {o.fermataOrario ? `Andata ${o.fermataOrario}` : 'Orario da definire'}
                  {o.orarioRitorno && ` · Ritorno ${o.orarioRitorno}`}
                </span>
                <EtichettaPosti posti={o.postiDisponibili} />
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
