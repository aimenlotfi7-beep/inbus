import type { CSSProperties, ReactNode } from 'react';

/** La forma minima necessaria per disegnare la card — non l'intero
 *  tipo Evento (che non tutte le schermate hanno a disposizione: alcune
 *  lavorano con versioni più leggere, es. EventoConPrenotazioni). Ogni
 *  schermata passa semplicemente il proprio oggetto, che ha comunque
 *  questi campi (magari con qualcuno in più, non importa). */
interface EventoMinimo {
  artista: string;
  genere: string;
  luogo: string;
  citta: string;
  data: string;
  slug?: string;
  immagineUrl: string | null;
}

/** La card evento condivisa da tutte le schermate del gestionale che
 *  elencano eventi (Eventi, Prenotazioni, Partenze, Lista d'attesa,
 *  Vetrina, Comunicazioni) — stesso aspetto ovunque, una sola versione
 *  da mantenere. Più compatta della versione originale (che viveva
 *  solo dentro Eventi): copertina più bassa, meno margini, testo più
 *  piccolo — pensata per stare bene anche quando gli eventi sono
 *  tanti e serve vederne di più in una schermata.
 *
 *  "badge" è per un'etichetta libera in alto a destra sulla copertina
 *  (es. "3 in attesa", "⚠ 2"). "richiedeIntervento" contorna la card
 *  di rosso — pensato per quando il badge da solo, con tanti eventi in
 *  elenco, rischia di passare inosservato. "completata" fa lo stesso
 *  ma di verde. "parziale" (giallo) è per il caso in mezzo — un evento
 *  con più tragitti insieme, dove ALCUNI sono a posto per questa tappa
 *  e ALTRI no ancora (es. metà evento già in vendita, l'altra metà da
 *  prezzare): né tutto fatto né niente fatto, va distinto da entrambi.
 *  Solo UNO tra richiedeIntervento/parziale/completata deve essere
 *  vero alla volta — il contorno colorato si AGGIUNGE al badge
 *  testuale, non lo sostituisce (i due possono comparire insieme). */
export function EventoCardCompatta({ evento, onClick, badge, badgeColore, richiedeIntervento, parziale, completata, extra, opacitaRidotta, mostraLinkPubblico, footer, selezionato }: {
  evento: EventoMinimo;
  onClick: () => void;
  badge?: ReactNode;
  /** Sfondo del badge — facoltativo, di default resta rosso (comportamento
   *  di sempre). Serve quando il badge deve rispecchiare uno stato che non
   *  è sempre "attenzione" (es. verde se fatto, arancio se parziale). */
  badgeColore?: string;
  richiedeIntervento?: boolean;
  parziale?: boolean;
  completata?: boolean;
  extra?: ReactNode;
  opacitaRidotta?: boolean;
  mostraLinkPubblico?: boolean;
  footer?: ReactNode;
  selezionato?: boolean;
}) {
  return (
    <div
      className={`evento-card-compatta${richiedeIntervento ? ' richiede-intervento' : ''}${parziale ? ' parziale' : ''}${completata ? ' completata' : ''}${selezionato ? ' selezionata' : ''}`}
      onClick={onClick}
      style={opacitaRidotta ? { opacity: .65 } : undefined}
    >
      {evento.immagineUrl && (
        <div className="evento-card-compatta-copertina">
          <img src={evento.immagineUrl} alt="" />
          {badge && <div className="evento-card-compatta-badge" style={badgeColore ? { '--badge-colore': badgeColore } as CSSProperties : undefined}>{badge}</div>}
          {mostraLinkPubblico && evento.slug && (
            <button
              type="button"
              className="evento-card-compatta-link-pubblico"
              title="Apri la pagina pubblica dell'evento"
              onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}/eventi/${evento.slug}`, '_blank'); }}
            >
              ↗
            </button>
          )}
        </div>
      )}
      <div className="evento-card-compatta-corpo">
        <span className="evento-card-compatta-genere">{evento.genere}</span>
        <h4>{evento.artista}</h4>
        <p>{evento.luogo}, {evento.citta}</p>
        <p>{new Date(evento.data).toLocaleDateString('it-IT')}</p>
        {extra}
        {footer}
      </div>
    </div>
  );
}
