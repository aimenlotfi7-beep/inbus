import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import '../styles/faq.css';
import '../styles/pagina.css';
import { Layout } from '../Layout';
import { pagineApi, type PaginaCms } from '../api/pagine';
import { ErroreApi } from '../api/client';
import { sanificaHtml } from '../shared/sanificaHtml';
import { useSeoTags } from '../features/useSeoTags';
import { Icona } from '../features/Icone';

/** HTML del CMS letto in un documento inerte (DOMParser): nessuno
 *  script parte e nessuna immagine si scarica mentre lo si analizza. */
function documentoInerte(html: string): Document {
  return new DOMParser().parseFromString(html || '', 'text/html');
}

/** Le prime frasi del contenuto, per la descrizione della pagina. */
function descrizioneDa(html: string): string {
  const testo = (documentoInerte(html).body.textContent ?? '').replace(/\s+/g, ' ').trim();
  return testo.length > 160 ? `${testo.slice(0, 157).trimEnd()}…` : testo;
}

/** Pagine editoriali del CMS (chi siamo, termini, privacy, cookie,
 *  contatti) e FAQ, dentro il Layout completo del sito. Il wrapper
 *  .pagina-editoriale è lo scope di faq.css e pagina.css. */
export function PaginaPage({ chiaveFissa }: { chiaveFissa?: string }) {
  const { chiave: chiaveParam } = useParams();
  const location = useLocation();
  const chiave = chiaveFissa ?? chiaveParam ?? '';
  const eFaq = chiave === 'faq';

  const [pagina, setPagina] = useState<PaginaCms | null>(null);
  const [errore, setErrore] = useState<{ nonTrovata: boolean; messaggio: string } | null>(null);

  useEffect(() => {
    setPagina(null);
    setErrore(null);
    pagineApi.getByChiave(chiave)
      .then(setPagina)
      .catch((e) => setErrore(e instanceof ErroreApi && e.status === 404
        ? { nonTrovata: true, messaggio: eFaq ? 'Nessuna domanda pubblicata ancora.' : 'Questa pagina non è ancora stata pubblicata.' }
        : { nonTrovata: false, messaggio: 'Non riesco a caricare la pagina. Riprova tra poco.' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  const titoloPredefinito = eFaq ? 'Domande frequenti' : 'OnWay';
  const titolo = pagina?.titolo || (errore?.nonTrovata && !eFaq ? 'Pagina non trovata' : titoloPredefinito);
  const descrizione = useMemo(() => (pagina ? descrizioneDa(pagina.contenuto) : ''), [pagina]);
  useSeoTags({
    title: titolo === 'OnWay' ? 'OnWay' : `${titolo} — OnWay`,
    description: descrizione || (eFaq ? 'Le risposte alle domande più comuni su viaggi, prenotazioni e biglietti OnWay.' : 'OnWay: bus per concerti ed eventi in tutta Italia.'),
    url: `${window.location.origin}${location.pathname}`,
  });

  return (
    <Layout>
      <main className="container-narrow pagina-editoriale">
        {!pagina && !errore && <p className="caricamento" role="status">Carico la pagina…</p>}

        {errore && (
          <>
            <h1>{eFaq ? 'Domande frequenti' : (errore.nonTrovata ? 'Pagina non trovata' : 'Pagina non disponibile')}</h1>
            <div className="stato-vuoto">
              <p>{errore.messaggio}</p>
              <div className="stato-vuoto-azioni">
                <Link className="btn btn-secondary" to="/pagina/contatti">Contattaci</Link>
                <Link className="btn btn-primary" to="/#eventi">Vai agli eventi</Link>
              </div>
            </div>
          </>
        )}

        {pagina && (
          <>
            <h1>{pagina.titolo || titoloPredefinito}</h1>
            {eFaq
              ? <FaqList contenuto={pagina.contenuto} />
              : <div className="contenuto" dangerouslySetInnerHTML={{ __html: sanificaHtml(pagina.contenuto) }} />}
          </>
        )}
      </main>
    </Layout>
  );
}

/** Il contenuto della FAQ è HTML semplice: ogni <h3> è una domanda, tutto
 *  quello che segue fino al prossimo <h3> è la risposta. Ogni coppia
 *  diventa un <details> (accordion nativo, funziona anche da tastiera). */
function FaqList({ contenuto }: { contenuto: string }) {
  const coppie = useMemo(() => {
    const risultato: { domanda: string; rispostaHtml: string }[] = [];
    for (const nodo of [...documentoInerte(contenuto).body.children]) {
      if (nodo.tagName === 'H3') risultato.push({ domanda: nodo.innerHTML, rispostaHtml: '' });
      else if (risultato.length) risultato[risultato.length - 1].rispostaHtml += nodo.outerHTML;
    }
    return risultato;
  }, [contenuto]);

  if (!coppie.length) {
    return (
      <div className="stato-vuoto">
        <p>Nessuna domanda pubblicata ancora.</p>
        <Link className="btn btn-secondary" to="/pagina/contatti">Contattaci</Link>
      </div>
    );
  }

  return (
    <div className="faq-elenco">
      {coppie.map((c, idx) => (
        <details className="faq-voce" key={idx}>
          <summary>
            <span className="faq-domanda" dangerouslySetInnerHTML={{ __html: sanificaHtml(c.domanda) }} />
            <Icona nome="freccia" dimensione={20} className="faq-freccia" />
          </summary>
          <div className="faq-risposta" dangerouslySetInnerHTML={{ __html: sanificaHtml(c.rispostaHtml) }} />
        </details>
      ))}
    </div>
  );
}
