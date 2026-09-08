import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { bundleApi, type BundlePubblicoDettaglio } from '../api/bundle';
import { eventiApi } from '../api/eventi';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { useSeoTags } from '../features/useSeoTags';
import { BundleFlusso } from '../features/bundle/BundleFlusso';
import { Layout } from '../Layout';

/** Pagina pubblica di un bundle sul sito: carica il bundle, monta il
 *  flusso condiviso (BundleFlusso) e alla conferma riempie il carrello. */
export function BundlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const carrello = useCarrello();
  // Stesso meccanismo del checkout evento singolo (CheckoutForm) — letto
  // qui perché il carrello vive a un URL diverso (/carrello), dove il
  // parametro si perderebbe. Stessa cosa per gli UTM subito sotto.
  const promoterCodice = new URLSearchParams(location.search).get('promo') || undefined;
  const parametriUrl = new URLSearchParams(location.search);
  const utmSource = parametriUrl.get('utm_source') || undefined;
  const utmMedium = parametriUrl.get('utm_medium') || undefined;
  const utmCampaign = parametriUrl.get('utm_campaign') || undefined;
  const utmContent = parametriUrl.get('utm_content') || undefined;
  const [bundle, setBundle] = useState<BundlePubblicoDettaglio | null>(null);
  const [stato, setStato] = useState<'caricamento' | 'pronto' | 'non-trovato'>('caricamento');

  useEffect(() => {
    if (!slug) return;
    bundleApi.dettaglioPubblico(slug).then((b) => { setBundle(b); setStato('pronto'); }).catch(() => setStato('non-trovato'));
  }, [slug]);

  useSeoTags({
    title: bundle ? `${bundle.nome} — OnWay` : 'Bundle — OnWay',
    description: bundle?.descrizione ?? 'Più eventi insieme con uno sconto dedicato.',
    image: bundle?.copertinaUrl ?? undefined,
    url: window.location.href,
  });

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}
        {stato === 'non-trovato' && <div className="checkout-summary">Questo bundle non è (più) disponibile. Vedi <Link to="/bundle">tutti i bundle</Link>.</div>}
        {stato === 'pronto' && bundle && (
          <BundleFlusso
            bundle={bundle}
            caricaEvento={(ev) => eventiApi.getBySlug(ev.slug)}
            caricaOpzioni={(eventoId, servizioId) => eventiApi.opzioniPartenza(eventoId, servizioId)}
            testoConferma="Vai al carrello"
            onConferma={async ({ righe, passeggeri, cliente, partecipanti }) => {
              carrello.impostaBundle(
                { id: bundle.id, nome: bundle.nome, scontoPercentuale: Number(bundle.scontoPercentuale), ammetteOfferte: bundle.ammetteOfferte, ammetteCredito: bundle.ammetteCredito, ammettePromoter: bundle.ammettePromoter, ammetteAcconto: bundle.ammetteAcconto, ...(bundle.ammettePromoter && promoterCodice && { promoterCodice }), ...(utmSource && { utmSource }), ...(utmMedium && { utmMedium }), ...(utmCampaign && { utmCampaign }), ...(utmContent && { utmContent }) },
                righe.map(({ evento, opzione }) => ({
                  eventoId: evento.id, eventoArtista: evento.artista, eventoData: evento.data,
                  tragittoId: opzione.tragittoId, fermataId: opzione.fermataId, fermataCitta: opzione.fermataCitta, fermataOrario: opzione.fermataOrario,
                  prezzoStimato: opzione.prezzoEffettivo, passeggeri, cliente, partecipanti,
                })),
              );
              navigate('/carrello');
            }}
          />
        )}
      </div>
    </Layout>
  );
}
