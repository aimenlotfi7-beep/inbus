import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { promoterApi } from '../api/promoter';

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
      .then((r) => navigate(`/eventi/${r.eventoSlug}?promo=${codice}`, { replace: true }))
      .catch(() => setErroreVisibile(true));
  }, [codice, navigate]);

  if (!erroreVisibile) return null; // reindirizza troppo in fretta perché serva un vero "caricamento"

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
      <p>Questo link non è (più) valido. Vai su <a href="/">onway.it</a> per vedere tutti gli eventi.</p>
    </div>
  );
}
