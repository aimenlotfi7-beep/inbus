import type { Evento } from '../api/types';

const SOGLIA_ULTIMI_POSTI = 5;

function postiRealiFermata(fermata: { postiMax: number | null; postiPrenotati: number }, postiLinea: number) {
  if (fermata.postiMax !== null) return Math.max(0, fermata.postiMax - fermata.postiPrenotati);
  return postiLinea;
}

function EtichettaDisponibilita({ posti }: { posti: number }) {
  if (posti === 0) return <span className="percorso-posti esaurito">Esaurito</span>;
  if (posti <= SOGLIA_ULTIMI_POSTI) return <span className="percorso-posti pochi">Ultimi {posti} posti</span>;
  return <span className="percorso-posti disponibile">{posti} posti disponibili</span>;
}

/** Il percorso del bus, in forma visiva — non un semplice elenco a
 *  tendina: ogni fermata mostrata come tappa, con orario e
 *  disponibilità reale (calcolata dai posti già prenotati, mai
 *  inventata). Una tappa finale per l'arrivo all'evento stesso. */
export function PercorsoBus({ evento }: { evento: Evento }) {
  if (!evento.linee.length) return null;

  return (
    <div className="percorso-bus-blocco">
      <h4>Percorso</h4>
      {evento.linee.map((linea) => (
        <div className="percorso-linea" key={linea.id}>
          {evento.linee.length > 1 && <p className="percorso-nome-linea">{linea.nome}</p>}
          <div className="percorso-tappe">
            {linea.fermate.map((f) => (
              <div className="percorso-tappa" key={f.id}>
                <div className="percorso-tappa-puntino" />
                <div className="percorso-tappa-corpo">
                  <b>{f.citta}</b>
                  {f.orario && <span className="percorso-orario">{f.orario}</span>}
                  <EtichettaDisponibilita posti={postiRealiFermata(f, linea.postiDisponibili)} />
                </div>
              </div>
            ))}
            <div className="percorso-tappa percorso-tappa-arrivo">
              <div className="percorso-tappa-puntino arrivo" />
              <div className="percorso-tappa-corpo">
                <b>{evento.citta} — {evento.luogo}</b>
                {evento.arrivoOrario && <span className="percorso-orario">{evento.arrivoOrario}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
