import { Link } from 'react-router-dom';
import type { Evento } from '../../api/types';
import { prezzoMinimoEvento } from '../../api/prezzi';

function postiTotaliDisponibili(evento: Evento) {
  return evento.linee.reduce((somma, l) => somma + l.postiDisponibili, 0);
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
// condivisibile con un'anteprima propria, invece di vivere solo dentro
// un popup nella home.
export function EventoCard({ evento }: { evento: Evento }) {
  // Il numero esatto di posti non si mostra mai al cliente: solo
  // un'etichetta impostata a mano dal gestionale (o nessuna). La
  // possibilità di prenotare/andare in lista d'attesa dipende invece dai
  // posti reali, indipendentemente dall'etichetta mostrata.
  const posti = postiTotaliDisponibili(evento);
  const copertina = evento.immagini[0]?.url;
  const prezzoMinimo = prezzoMinimoEvento(evento);

  return (
    <Link to={`/eventi/${evento.slug}`} className="card reveal in" style={{ display: 'block', color: 'inherit' }}>
      <div className="card-visual" style={copertina ? { backgroundImage: `url(${copertina})` } : undefined}>
        {!copertina && <div className="beam" />}
        <span className="tag">{evento.genere}</span>
      </div>
      <div className="card-body">
        <h3>{evento.artista}</h3>
        <div className="card-meta"><span>{evento.luogo}, {evento.citta}</span><span>{fmtData(evento.data)}</span></div>
        {evento.statoDisponibilita && (
          <div className="card-meta">
            <span className={evento.statoDisponibilita === 'ESAURITO' ? 'posti-basso' : ''}>
              {ETICHETTA_STATO[evento.statoDisponibilita]}
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
