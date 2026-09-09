import { useEffect, useState } from 'react';
import { bundleApi, type BundlePubblico } from '../api/bundle';
import { BundleCard } from '../features/bundle/BundleCard';

export function BundleListaPage() {
  const [lista, setLista] = useState<BundlePubblico[] | null>(null);
  useEffect(() => { bundleApi.listaPubblica().then(setLista).catch(() => setLista([])); }, []);
  return (
    <section className="events-section" style={{ paddingTop: 40 }}>
      <div className="section-head">
        <div>
          <h2 className="section-title"><em>Bundle</em></h2>
          <p className="section-sub">Più eventi insieme, con uno sconto dedicato.</p>
        </div>
      </div>
      {lista === null ? <p className="section-sub">Carico...</p>
        : lista.length === 0 ? <p className="section-sub">Nessun bundle disponibile al momento.</p>
        : <div className="carosello-wrap"><div className="carosello carosello-compatto">{lista.map((b) => <BundleCard key={b.id} bundle={b} />)}</div></div>}
    </section>
  );
}
