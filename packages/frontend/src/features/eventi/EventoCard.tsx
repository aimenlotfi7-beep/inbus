import { Link } from 'react-router-dom';
import type { Evento } from '../../api/types';
import { prezzoMinimoEvento } from '../../api/prezzi';

function postiTotaliDisponibili(evento: Evento) {
  const tutteLeLinee = [...evento.linee, ...evento.prodotti.flatMap((v) => v.linee)];
  return tutteLeLinee.reduce((somma, l) => somma + l.postiDisponibili, 0);
}

/** Le città di partenza vere, dalle fermate reali — non un dato a
 *  parte da tenere aggiornato a mano, semplicemente quello che c'è
 *  già nelle tratte di questo evento (comprese quelle dentro un
 *  viaggio, se ne ha). */
function cittaPartenzaEvento(evento: Evento): string[] {
  const insieme = new Set<string>();
  const tutteLeLinee = [...evento.linee, ...evento.prodotti.flatMap((v) => v.linee)];
  tutteLeLinee.forEach((l) => l.fermate.forEach((f) => insieme.add(f.citta)));
  return Array.from(insieme);
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

const ETICHETTA_STATO: Record<NonNullable<Evento['statoDisponibilita']>, string> = {
  POCHI_POSTI: 'Pochi posti disponibili',
  NUOVI_POSTI: 'Nuovi posti disponibili',
  ESAURITO: 'Posti terminati',
};

// La card porta sempre alla pagina dedicata dell'evento (/eventi/:slug):
// così ogni evento ha un suo indirizzo indicizzabile da Google e
// condivisibile con un'anteprima propria — la stessa identica pagina sia
// dentro l'area cliente sia fuori, coerente ovunque.
export function EventoCard({ evento }: { evento: Evento }) {
  // Il numero esatto di posti non si mostra mai al cliente: solo
  // un'etichetta impostata a mano dal gestionale (o nessuna). La
  // possibilità di prenotare/andare in lista d'attesa dipende invece dai
  // posti reali, indipendentemente dall'etichetta mostrata.
  const posti = postiTotaliDisponibili(evento);
  const copertina = evento.immagini[0]?.url;
  const prezzoMinimo = prezzoMinimoEvento(evento);
  const cittaPartenza = cittaPartenzaEvento(evento);
  // L'etichetta mostrata: quella scelta a mano dal gestionale ha
  // sempre la priorità; se non c'è nessuna etichetta ma i posti veri
  // sono davvero zero, mostriamo comunque "Esaurito" — il cliente non
  // deve scoprirlo solo perché la CTA è cambiata in "Lista d'attesa".
  const etichettaStato = evento.statoDisponibilita
    ? ETICHETTA_STATO[evento.statoDisponibilita]
    : (posti === 0 ? 'Esaurito' : null);

  return (
    <Link to={`/eventi/${evento.slug}`} className="card reveal in" style={{ display: 'block', color: 'inherit' }}>
      <div className="card-visual">
        {copertina ? (
          <img
            src={copertina}
            alt={`${evento.artista} — ${evento.luogo}, ${evento.citta}`}
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="beam" />
        )}
        <span className="tag" style={{ position: 'relative', zIndex: 1 }}>{evento.genere}</span>
      </div>
      <div className="card-body">
        <h3>{evento.artista}</h3>
        <div className="card-meta"><span>{evento.luogo}, {evento.citta}</span><span>{fmtData(evento.data)}</span></div>
        {!!cittaPartenza.length && (
          <div className="card-meta">
            <span style={{ opacity: .75 }}>
              🚌 Parte da {cittaPartenza.length === 1 ? cittaPartenza[0] : `${cittaPartenza.length} città`}
            </span>
          </div>
        )}
        {etichettaStato && (
          <div className="card-meta">
            <span className={etichettaStato === 'Esaurito' || evento.statoDisponibilita === 'ESAURITO' ? 'posti-basso' : ''}>
              {etichettaStato}
            </span>
          </div>
        )}
        <div className="card-foot">
          <div className="price">
            {prezzoMinimo !== null ? <>da €{prezzoMinimo.toFixed(0)}<span> /persona</span></> : <span>Prezzo da definire</span>}
          </div>
          <span className="card-cta">
            {posti === 0 ? "Lista d'attesa" : 'Prenota'}
          </span>
        </div>
      </div>
    </Link>
  );
}
