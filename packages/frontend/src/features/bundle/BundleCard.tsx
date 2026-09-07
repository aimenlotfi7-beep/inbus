import { Link } from 'react-router-dom';
import { type BundlePubblico, formattaDataOraIt } from '../../api/bundle';

/** Card di un bundle nell'elenco e in home: stesse classi della card
 *  evento (.card/.card-visual/.card-body) — nessuno stile nuovo, solo
 *  l'etichetta "Bundle" e lo stato al posto del "da € X". */
export function BundleCard({ bundle }: { bundle: BundlePubblico }) {
  const sconto = Number(bundle.scontoPercentuale);
  return (
    <Link to={`/bundle/${bundle.slug}`} className="card reveal in" style={{ display: 'block', color: 'inherit' }}>
      <div className="card-visual">
        {bundle.copertinaUrl ? (
          <img src={bundle.copertinaUrl} alt={bundle.nome} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : <div className="beam" />}
        <span className="tag" style={{ position: 'relative', zIndex: 1 }}>Bundle</span>
      </div>
      <div className="card-body">
        <h3>{bundle.nome}</h3>
        <div className="card-meta">
          <span>{bundle.tipo === 'FISSO' ? 'Pacchetto fisso' : 'Scegli tu gli eventi'}</span>
          <span style={{ fontWeight: 700 }}>−{sconto}%</span>
        </div>
        {bundle.stato === 'PROGRAMMATO' && bundle.inizioVendita && <div className="card-meta"><span style={{ opacity: .75 }}>Disponibile dal {formattaDataOraIt(bundle.inizioVendita)}</span></div>}
        {bundle.stato === 'VENDITA_TERMINATA' && <div className="card-meta"><span style={{ opacity: .75 }}>Vendita terminata</span></div>}
      </div>
    </Link>
  );
}
