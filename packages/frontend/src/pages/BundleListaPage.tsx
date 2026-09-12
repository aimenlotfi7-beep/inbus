import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bundleApi, type BundlePubblico } from '../api/bundle';
import { BundleCard } from '../features/bundle/BundleCard';
import { CardScheletro } from '../features/eventi/EventoCard';
import { useSeoTags } from '../features/useSeoTags';

export function BundleListaPage() {
  const [lista, setLista] = useState<BundlePubblico[] | null>(null);
  useEffect(() => { bundleApi.listaPubblica().then(setLista).catch(() => setLista([])); }, []);

  useSeoTags({
    title: 'Bundle — OnWay',
    description: 'Più eventi insieme, con uno sconto dedicato: scegli il bundle e prenota il bus per tutte le date in una volta.',
    url: `${window.location.origin}/bundle`,
  });

  return (
    <main className="container pagina-elenco">
      <div className="section-head">
        <div>
          <h1 className="section-title">Bundle</h1>
          <p className="section-sub">Più eventi insieme, con uno sconto dedicato.</p>
        </div>
      </div>
      {lista === null ? (
        <div className="griglia-eventi" aria-busy="true" aria-label="Carico i bundle…">
          {Array.from({ length: 3 }, (_, i) => <CardScheletro key={i} />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="stato-vuoto">
          <h2>Nessun bundle disponibile al momento</h2>
          <p>I bundle escono quando ci sono più date da combinare: intanto guarda gli eventi in programma.</p>
          <Link className="btn btn-secondary" to="/#eventi">Vedi tutti gli eventi</Link>
        </div>
      ) : (
        <>
          {/* Le card hanno titoli h3: senza questo h2 si salterebbe un livello. */}
          <h2 className="sr-only">Bundle disponibili</h2>
          <div className="griglia-eventi">
            {lista.map((b, i) => <BundleCard key={b.id} bundle={b} priorita={i < 2} />)}
          </div>
        </>
      )}
    </main>
  );
}
