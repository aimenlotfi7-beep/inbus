import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { bundleApi, type BundlePubblicoDettaglio } from '../api/bundle';
import { eventiApi } from '../api/eventi';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { provenienzaDaUrl } from '../features/checkout/provenienza';
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
  // qui perché il carrello vive a un URL diverso (/carrello), dove i
  // parametri si perderebbero.
  const provenienza = provenienzaDaUrl(location.search);
  const { promoterCodice, ...utm } = provenienza;
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
      <main className="container bundle-pagina">
        {stato === 'caricamento' && <p className="caricamento" role="status">Carico il bundle…</p>}
        {stato === 'non-trovato' && (
          <div className="stato-vuoto">
            <h3>Questo bundle non è più disponibile</h3>
            <p>Può essere terminato o il link non è corretto. Gli altri bundle e tutti gli eventi sono ancora prenotabili.</p>
            <div className="stato-vuoto-azioni">
              <Link className="btn btn-primary" to="/bundle">Vedi tutti i bundle</Link>
              <Link className="btn btn-secondary" to="/#eventi">Vai agli eventi</Link>
            </div>
          </div>
        )}
        {stato === 'pronto' && bundle && (
          <BundleFlusso
            bundle={bundle}
            caricaEvento={(ev) => eventiApi.getBySlug(ev.slug)}
            caricaOpzioni={(eventoId, servizioId) => eventiApi.opzioniPartenza(eventoId, servizioId)}
            // Come nel checkout evento: tra un passo e l'altro "Continua"
            // (il carrello è il passo "Riepilogo").
            testoConferma="Continua"
            onConferma={async ({ righe, passeggeri, cliente, partecipanti }) => {
              carrello.impostaBundle(
                { id: bundle.id, nome: bundle.nome, scontoPercentuale: Number(bundle.scontoPercentuale), ammetteOfferte: bundle.ammetteOfferte, ammetteCredito: bundle.ammetteCredito, ammettePromoter: bundle.ammettePromoter, ammetteAcconto: bundle.ammetteAcconto, ...(bundle.ammettePromoter && promoterCodice && { promoterCodice }), ...utm },
                righe.map(({ evento, opzione }) => ({
                  eventoId: evento.id, eventoArtista: evento.artista, eventoData: evento.data,
                  // Miniatura, città e indirizzo nel carrello come per il checkout
                  // evento. Niente eventoSlug: il carrello mostrerebbe "Modifica"
                  // verso la pagina evento, e da lì il bundle decadrebbe.
                  eventoImmagine: evento.immagineUrl ?? undefined, eventoCitta: evento.citta, eventoLuogo: evento.luogo,
                  tragittoId: opzione.tragittoId, fermataId: opzione.fermataId, fermataCitta: opzione.fermataCitta, fermataOrario: opzione.fermataOrario,
                  fermataIndirizzo: opzione.fermataIndirizzo || undefined, orarioRitorno: opzione.orarioRitorno,
                  // Con cliente.dataNascita e cliente.citta (da ospite): senza,
                  // il carrello rifiuta l'ordine.
                  prezzoStimato: opzione.prezzoEffettivo, passeggeri, cliente, partecipanti,
                  // Se il bundle decade (un articolo tolto o aggiunto), ogni
                  // articolo resta attribuito come nel checkout singolo.
                  ...provenienza,
                })),
              );
              navigate('/carrello');
            }}
          />
        )}
      </main>
    </Layout>
  );
}
