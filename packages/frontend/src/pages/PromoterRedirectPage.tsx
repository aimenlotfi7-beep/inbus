import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { promoterApi } from '../api/promoter';
import { Layout } from '../Layout';

/** /p/:codice — il link che un promoter condivide. Non è una pagina
 *  vera: risolve il codice opaco (mai il suo nome/codice leggibile, e
 *  specifico per quell'evento) e reindirizza SUBITO alla pagina vera
 *  dell'evento, portando avanti lo stesso codice come ?promo= — da lì
 *  in poi il flusso è identico a un link diretto sull'evento. */
export function PromoterRedirectPage() {
  const { codice } = useParams<{ codice: string }>();
  const navigate = useNavigate();
  const [erroreVisibile, setErroreVisibile] = useState(false);

  useEffect(() => {
    if (!codice) return;
    promoterApi.risolviLink(codice)
      .then((r) => navigate(`/eventi/${r.eventoSlug}?promo=${encodeURIComponent(codice)}`, { replace: true }))
      .catch(() => setErroreVisibile(true));
  }, [codice, navigate]);

  if (!erroreVisibile) return <p className="caricamento" role="status">Ti porto all'evento…</p>;

  return (
    <Layout>
      <main className="container-narrow pagina-non-trovata">
        <div className="stato-vuoto" role="alert">
          <h1>Link non valido</h1>
          <p>Questo link non è valido o è scaduto. Gli eventi in programma li trovi tutti in home.</p>
          <div className="stato-vuoto-azioni">
            <Link className="btn btn-primary btn-lg" to="/#eventi">Vai agli eventi</Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
