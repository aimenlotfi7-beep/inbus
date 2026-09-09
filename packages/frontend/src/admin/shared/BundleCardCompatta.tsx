import { ETICHETTA_STATO_BUNDLE, CLASSE_STATO_BUNDLE, type BundleRiga } from '../../api/bundle';

/** Stessa forma visiva di EventoCardCompatta (stesse classi CSS
 *  evento-card-compatta-*), ma per un bundle — campi diversi (nome,
 *  tipo, sconto, numero eventi) invece di artista/luogo/data. Tenuta
 *  separata invece di forzare il bundle dentro "EventoMinimo": i campi
 *  non corrispondono e non ha senso far finta che siano la stessa cosa. */
export function BundleCardCompatta({ bundle, onClick, onElimina }: { bundle: BundleRiga; onClick: () => void; onElimina: () => void }) {
  return (
    <div className="evento-card-compatta" onClick={onClick}>
      {bundle.copertinaUrl ? (
        <div className="evento-card-compatta-copertina">
          <img src={bundle.copertinaUrl} alt="" />
          <div className={`evento-card-compatta-badge badge ${CLASSE_STATO_BUNDLE[bundle.stato]}`}>{ETICHETTA_STATO_BUNDLE[bundle.stato]}</div>
        </div>
      ) : (
        <div className="evento-card-compatta-copertina" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dusk-2)' }}>
          <span style={{ fontSize: 12, color: 'var(--mist)' }}>Nessuna copertina</span>
          <div className={`evento-card-compatta-badge badge ${CLASSE_STATO_BUNDLE[bundle.stato]}`}>{ETICHETTA_STATO_BUNDLE[bundle.stato]}</div>
        </div>
      )}
      <div className="evento-card-compatta-corpo">
        <span className="evento-card-compatta-genere">{bundle.tipo === 'FISSO' ? 'Bundle fisso' : 'Bundle libero'}</span>
        <h4>{bundle.nome}</h4>
        <p>{bundle.numeroEventi} evento/i · −{Number(bundle.scontoPercentuale)}%</p>
        {bundle.inEvidenzaHome && <p>★ In evidenza in home</p>}
        <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--pink)', padding: 0 }} onClick={(e) => { e.stopPropagation(); onElimina(); }}>
          Elimina
        </button>
      </div>
    </div>
  );
}
