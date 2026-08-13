import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/faq.css';
import '../styles/pagina.css';
import { PublicPageLayout } from '../PublicPageLayout';
import { pagineApi, type PaginaCms } from '../api/pagine';
import { ErroreApi } from '../api/client';

export function PaginaPage({ chiaveFissa }: { chiaveFissa?: string }) {
  const { chiave: chiaveParam } = useParams();
  const chiave = chiaveFissa ?? chiaveParam ?? '';
  const eFaq = chiave === 'faq';

  const [pagina, setPagina] = useState<PaginaCms | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setPagina(null);
    setErrore(null);
    pagineApi.getByChiave(chiave)
      .then(setPagina)
      .catch((e) => setErrore(e instanceof ErroreApi && e.status === 404
        ? (eFaq ? 'Nessuna domanda pubblicata ancora.' : 'Questa pagina non è ancora stata pubblicata.')
        : 'Impossibile caricare la pagina.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  if (eFaq) {
    return (
      <PublicPageLayout>
        <main>
          <h1>{pagina?.titolo || 'Domande frequenti'}</h1>
          <div id="faqList">
            {errore && <p style={{ color: 'var(--mist)' }}>{errore}</p>}
            {pagina && <FaqList contenuto={pagina.contenuto} />}
          </div>
        </main>
      </PublicPageLayout>
    );
  }

  return (
    <PublicPageLayout>
      <main>
        <h1>{pagina?.titolo ?? (errore ? 'Pagina non trovata' : 'Pagina')}</h1>
        {errore
          ? <div className="contenuto"><p>{errore}</p></div>
          : pagina && <div className="contenuto" dangerouslySetInnerHTML={{ __html: pagina.contenuto }} />}
      </main>
    </PublicPageLayout>
  );
}

/** Il contenuto della FAQ è HTML semplice con coppie <h3>domanda</h3><p>risposta</p>:
 *  le raggruppo in card, stessa logica del prototipo originale. */
function FaqList({ contenuto }: { contenuto: string }) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = contenuto || '';
  const nodi = [...wrapper.children];
  const coppie: { domanda: string; rispostaHtml: string }[] = [];
  let i = 0;
  while (i < nodi.length) {
    const nodo = nodi[i];
    if (nodo && nodo.tagName === 'H3') {
      const risposta = nodi[i + 1]?.outerHTML ?? '';
      coppie.push({ domanda: nodo.innerHTML, rispostaHtml: risposta });
      i += 2;
    } else {
      i += 1;
    }
  }

  if (!coppie.length) return <p style={{ color: 'var(--mist)' }}>Nessuna domanda pubblicata ancora.</p>;

  return (
    <>
      {coppie.map((c, idx) => (
        <div className="faq-item" key={idx}>
          <h3 dangerouslySetInnerHTML={{ __html: c.domanda }} />
          <div dangerouslySetInnerHTML={{ __html: c.rispostaHtml }} />
        </div>
      ))}
    </>
  );
}
