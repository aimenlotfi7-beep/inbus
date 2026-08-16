import type { Evento } from '../../api/types';
import { prezzoMinimoEvento } from '../../api/prezzi';

function postiTotaliDisponibili(evento: Evento) {
  return evento.linee.reduce((somma, l) => somma + l.postiDisponibili, 0);
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export function EventoCard({ evento, onPrenota }: { evento: Evento; onPrenota: (evento: Evento) => void }) {
  const posti = postiTotaliDisponibili(evento);
  const copertina = evento.immagini[0]?.url;
  const prezzoMinimo = prezzoMinimoEvento(evento);

  return (
    <div className="card reveal in">
      <div className="card-visual" style={copertina ? { backgroundImage: `url(${copertina})` } : undefined}>
        {!copertina && <div className="beam" />}
        <span className="tag">{evento.genere}</span>
      </div>
      <div className="card-body">
        <h3>{evento.artista}</h3>
        <div className="card-meta"><span>{evento.luogo}, {evento.citta}</span><span>{fmtData(evento.data)}</span></div>
        <div className="card-meta">
          <span className={posti <= 6 && posti > 0 ? 'posti-basso' : ''}>
            {posti === 0 ? 'Nessun posto disponibile' : `${posti} post${posti === 1 ? 'o' : 'i'} disponibil${posti === 1 ? 'e' : 'i'}`}
          </span>
        </div>
        <div className="card-foot">
          <div className="price">
            {prezzoMinimo !== null ? <>da €{prezzoMinimo.toFixed(0)}<span> /persona</span></> : <span>Prezzo da definire</span>}
          </div>
          <button className="card-cta" disabled={posti === 0} onClick={() => onPrenota(evento)}>
            {posti === 0 ? "Lista d'attesa" : 'Prenota'}
          </button>
        </div>
      </div>
    </div>
  );
}
