import type { Evento } from '../api/types';

const SOGLIA_ULTIMI_POSTI = 5;

function postiRealiFermata(fermata: { postiMax: number | null; postiPrenotati: number }, postiLinea: number) {
  if (fermata.postiMax !== null) return Math.max(0, fermata.postiMax - fermata.postiPrenotati);
  return postiLinea;
}

function EtichettaDisponibilita({ posti }: { posti: number }) {
  // Dicitura generica, non il numero esatto — solo lo stato.
  if (posti === 0) return <span className="percorso-posti esaurito">Esaurito</span>;
  if (posti <= SOGLIA_ULTIMI_POSTI) return <span className="percorso-posti pochi">Pochi posti disponibili</span>;
  return <span className="percorso-posti disponibile">Posti disponibili</span>;
}

/** Le partenze — un unico elenco (non più diviso per tratta), ordinato
 *  per orario crescente: più facile da leggere quando ci sono più
 *  tratte insieme. Disponibilità reale (calcolata dai posti già
 *  prenotati) ma con dicitura generica, non il numero esatto. */
export function PercorsoBus({ evento }: { evento: Evento }) {
  const tutteLeLinee = [...evento.linee, ...evento.prodotti.flatMap((v) => v.linee)];
  if (!tutteLeLinee.length) return null;

  const tappe = tutteLeLinee.flatMap((linea) =>
    linea.fermate.map((f) => ({ ...f, posti: postiRealiFermata(f, linea.postiDisponibili), nomeLinea: linea.nome }))
  ).sort((a, b) => (a.orario ?? '99:99').localeCompare(b.orario ?? '99:99'));

  return (
    <div className="percorso-bus-blocco">
      <div className="percorso-tappe">
        {tappe.map((f) => (
          <div className="percorso-tappa" key={f.id}>
            <div className="percorso-tappa-puntino" />
            <div className="percorso-tappa-corpo">
              <b>{f.citta}</b>
              {f.orario && <span className="percorso-orario">{f.orario}</span>}
              <EtichettaDisponibilita posti={f.posti} />
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
  );
}
