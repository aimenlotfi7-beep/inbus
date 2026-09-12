import { Link } from 'react-router-dom';
import { Layout } from '../Layout';
import { useSeoTags } from '../features/useSeoTags';

/** Qualunque indirizzo che non corrisponde a una rotta (rotta "*" in
 *  App.tsx): header e piè di pagina del sito, un messaggio chiaro e due
 *  strade per ripartire. */
export function NonTrovataPage() {
  useSeoTags({
    title: 'Pagina non trovata — OnWay',
    description: 'Il link potrebbe essere sbagliato o la pagina non esiste più.',
    url: window.location.href,
  });
  return (
    <Layout>
      <main className="container-narrow pagina-non-trovata">
        <div className="stato-vuoto">
          <h1>Pagina non trovata</h1>
          <p>Il link potrebbe essere sbagliato o la pagina non esiste più.</p>
          <div className="stato-vuoto-azioni">
            <Link className="btn btn-primary btn-lg" to="/#eventi">Vai agli eventi</Link>
            <Link className="btn btn-secondary btn-lg" to="/pagina/contatti">Contattaci</Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
