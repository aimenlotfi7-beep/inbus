import { useId } from 'react';
import type { OpzionePartenza } from '../../api/types';
import { applicaScontoOfferta } from '../../api/prezzi';
import { formattaEuro } from '../../shared/formato';
import { Icona } from '../Icone';
import { ElencoFermate } from './ElencoFermate';
import { SOGLIA_ELENCO_LUNGO, type DatiFermata } from './regoleFermate';

/** Fino a questa soglia i posti si dicono "pochi" — stessa regola di
 *  PercorsoBus e della sezione Partenze della pagina evento. */
const SOGLIA_POCHI_POSTI = 5;

/** Ordinate per regione (alfabetico, quelle senza regione in fondo) e
 *  poi per città — usata ancora dal menu a tendina dei bundle. */
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

/** Le informazioni di un'opzione che servono all'elenco (ricerca, regioni, posizione). */
export function datiOpzione(o: OpzionePartenza): DatiFermata {
  return {
    citta: o.fermataCitta, indirizzo: o.fermataIndirizzo, orario: o.fermataOrario,
    regione: o.fermataRegione, lat: o.fermataLat ?? null, lng: o.fermataLng ?? null,
  };
}

/** La scelta della fermata di partenza: un gruppo di radio (nativi,
 *  nascosti alla vista ma non alla tastiera né allo screen reader) dove
 *  ogni opzione è una card con città, prezzo, orari e disponibilità.
 *  Con molte fermate (ElencoFermate) compaiono ricerca, posizione e
 *  regioni, e le card diventano compatte: indirizzo e ritorno solo sulla
 *  fermata scelta. Le fermate esaurite restano selezionabili: portano
 *  alla lista d'attesa. Il menu a tendina (SelettoreFermata) resta nei bundle. */
export function SceltaFermata({ opzioni, valore, onSeleziona, offerta, legenda = 'Fermata di partenza' }: {
  opzioni: OpzionePartenza[];
  valore: string;
  onSeleziona: (fermataId: string) => void;
  offerta?: { scontoPercentuale: number };
  legenda?: string;
}) {
  const nomeGruppo = useId();
  const prezzoDi = (o: OpzionePartenza) => (offerta ? applicaScontoOfferta(o.prezzoEffettivo, offerta.scontoPercentuale) : o.prezzoEffettivo);

  return (
    <fieldset className="fermate">
      {/* Con l'elenco lungo c'è già "Da dove parti?" sopra la ricerca: il
          titolo del gruppo resta per gli screen reader, non a schermo. */}
      <legend className={opzioni.length > SOGLIA_ELENCO_LUNGO ? 'sr-only' : 'campo-etichetta'}>{legenda}</legend>
      <ElencoFermate
        voci={opzioni}
        dati={datiOpzione}
        chiave={(o) => o.fermataId}
        prezzo={prezzoDi}
        selezionata={valore || undefined}
        classeElenco="fermate-elenco"
        renderVoce={(o, { compatta, distanza }) => {
          const prezzo = prezzoDi(o);
          const selezionata = o.fermataId === valore;
          const dettagli = !compatta || selezionata;
          return (
            <label className={`fermata-opzione${selezionata ? ' selezionata' : ''}${compatta ? ' compatta' : ''}`}>
              <input
                type="radio"
                name={nomeGruppo}
                value={o.fermataId}
                checked={selezionata}
                onChange={() => onSeleziona(o.fermataId)}
              />
              <span className="fermata-citta">
                {o.fermataCitta}
                {distanza && <small className="fermata-distanza"> · {distanza}</small>}
              </span>
              <span className="fermata-prezzo">
                {formattaEuro(prezzo, { senzaDecimali: Number.isInteger(prezzo) })}
                {offerta && <small> invece di {formattaEuro(o.prezzoEffettivo, { senzaDecimali: Number.isInteger(o.prezzoEffettivo) })}</small>}
              </span>
              {dettagli && o.fermataIndirizzo && <span className="fermata-indirizzo">{o.fermataIndirizzo}</span>}
              <span className="fermata-orari">
                <Icona nome="orologio" dimensione={14} />
                {o.fermataOrario ? `Andata ${o.fermataOrario}` : 'Orario da definire'}
                {dettagli && o.orarioRitorno && ` · Ritorno ${o.orarioRitorno}`}
              </span>
              <EtichettaPosti posti={o.postiDisponibili} />
            </label>
          );
        }}
      />
    </fieldset>
  );
}
