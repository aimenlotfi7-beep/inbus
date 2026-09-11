import type { TourRiga } from '../../api/tour';

/** Stessa forma visiva di EventoCardCompatta/BundleCardCompatta
 *  (stesse classi CSS evento-card-compatta-*) — stile e posizione
 *  omogenei in tutto il gestionale, come richiesto. */
export function TourCardCompatta({ tour, onClick, onElimina }: { tour: TourRiga; onClick: () => void; onElimina: () => void }) {
  return (
    <div className="evento-card-compatta" onClick={onClick}>
      {tour.copertinaUrl ? (
        <div className="evento-card-compatta-copertina">
          <img src={tour.copertinaUrl} alt="" />
          <div className="evento-card-compatta-badge badge">{tour.numeroEventi} date</div>
        </div>
      ) : (
        <div className="evento-card-compatta-copertina" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dusk-2)' }}>
          <span style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)' }}>Nessuna copertina</span>
          <div className="evento-card-compatta-badge badge">{tour.numeroEventi} date</div>
        </div>
      )}
      <div className="evento-card-compatta-corpo">
        <span className="evento-card-compatta-genere">Tour</span>
        <h4>{tour.nome}</h4>
        <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 'var(--testo-xs)', color: 'var(--pink)', padding: 0 }} onClick={(e) => { e.stopPropagation(); onElimina(); }}>
          Elimina
        </button>
      </div>
    </div>
  );
}
