import { Link } from 'react-router-dom';
import type { Evento } from '../../api/types';
import { intervalloPrezzoEvento } from '../../api/prezzi';
import { formattaEuro } from '../../shared/formato';

function postiTotaliDisponibili(evento: Evento) {
  const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((v) => v.tragitti)];
  return tuttiITragitti.reduce((somma, l) => somma + l.postiDisponibili, 0);
}

/** Le città di partenza vere, dalle fermate reali — non un dato a
 *  parte da tenere aggiornato a mano, semplicemente quello che c'è
 *  già nelle tratte di questo evento (comprese quelle dentro un
 *  servizio, se ne ha). */
function cittaPartenzaEvento(evento: Evento): string[] {
  const insieme = new Set<string>();
  const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((v) => v.tragitti)];
  tuttiITragitti.forEach((l) => l.fermate.forEach((f) => insieme.add(f.citta)));
  return Array.from(insieme);
}

function fmtData(iso: string) {
  const d = new Date(iso);
  // Per esteso, su richiesta — non più "15 giu" ma "15 giugno 2027".
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ETICHETTA_STATO: Record<NonNullable<Evento['statoDisponibilita']>, string> = {
  POCHI_POSTI: 'Pochi posti disponibili',
  NUOVI_POSTI: 'Nuovi posti disponibili',
  ESAURITO: 'Posti terminati',
};

/** "da €35" se tutte le fermate costano uguale, "da €35 a €90" se
 *  variano — più onesto del solo minimo quando lo scarto è ampio (il
 *  cliente non scopre la cifra vera solo dopo aver scelto la sua
 *  fermata). */
function testoPrezzo(evento: Evento): string | null {
  const intervallo = intervalloPrezzoEvento(evento);
  if (!intervallo) return null;
  return intervallo.min === intervallo.max
    ? `da ${formattaEuro(intervallo.min, { senzaDecimali: true })}`
    : `da ${formattaEuro(intervallo.min, { senzaDecimali: true })} a ${formattaEuro(intervallo.max, { senzaDecimali: true })}`;
}

// La card porta sempre alla pagina dedicata dell'evento (/eventi/:slug):
// così ogni evento ha un suo indirizzo indicizzabile da Google e
// condivisibile con un'anteprima propria — la stessa identica pagina sia
// dentro l'area cliente sia fuori, coerente ovunque.
export function EventoCard({ evento }: { evento: Evento }) {
  // Card virtuale di un Tour (più date raggruppate) — niente posti/città
  // di partenza da calcolare (tragitti/servizi sono vuoti apposta, la
  // vendibilità vive nelle singole date), link alla pagina del Tour
  // invece che a un evento, CTA diversa ("Vedi le date").
  if (evento.tour) {
    const copertina = evento.immagini[0]?.url;
    const prezzo = testoPrezzo(evento);
    return (
      <Link to={`/tour/${evento.slug}`} className="card reveal in" style={{ display: 'block', color: 'inherit' }}>
        <div className="card-visual">
          {copertina ? (
            <img src={copertina} alt={evento.artista} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : <div className="beam" />}
          <span className="tag" style={{ position: 'relative', zIndex: 1 }}>{evento.genere}</span>
        </div>
        <div className="card-body">
          <h3>{evento.artista}</h3>
          <div className="card-meta"><span>{evento.luogo}</span><span>{evento.citta}</span></div>
          <div className="card-foot">
            {prezzo && <span style={{ fontSize: 'var(--testo-md)', fontWeight: 700 }}>{prezzo}</span>}
            <span className="card-cta">Vedi le date</span>
          </div>
        </div>
      </Link>
    );
  }

  // Il numero esatto di posti non si mostra mai al cliente: solo
  // un'etichetta impostata a mano dal gestionale (o nessuna). La
  // possibilità di prenotare/andare in lista d'attesa dipende invece dai
  // posti reali, indipendentemente dall'etichetta mostrata.
  const posti = postiTotaliDisponibili(evento);
  const copertina = evento.immagini[0]?.url;
  const cittaPartenza = cittaPartenzaEvento(evento);
  const prezzo = testoPrezzo(evento);
  // L'etichetta mostrata: quella scelta a mano dal gestionale ha
  // sempre la priorità; se non c'è nessuna etichetta ma i posti veri
  // sono davvero zero, mostriamo comunque "Esaurito" — il cliente non
  // deve scoprirlo solo perché la CTA è cambiata in "Lista d'attesa".
  const etichettaStato = evento.statoDisponibilita
    ? ETICHETTA_STATO[evento.statoDisponibilita]
    : (posti === 0 ? 'Esaurito' : null);

  return (
    <Link to={`/eventi/${evento.slug}`} className="card reveal in" style={{ display: 'block', color: 'inherit' }}>
      <div className="card-visual">
        {copertina ? (
          <img
            src={copertina}
            alt={`${evento.artista} — ${evento.luogo}, ${evento.citta}`}
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="beam" />
        )}
        <span className="tag" style={{ position: 'relative', zIndex: 1 }}>{evento.genere}</span>
      </div>
      <div className="card-body">
        <h3>{evento.artista}</h3>
        <div className="card-meta"><span>{evento.luogo}, {evento.citta}</span></div>
        <div className="card-meta"><span>{fmtData(evento.data)}</span></div>
        {!!cittaPartenza.length && (
          <div className="card-meta">
            <span style={{ opacity: .75 }}>
              🚌 Parte da {cittaPartenza.length === 1 ? cittaPartenza[0] : `${cittaPartenza.length} città`}
            </span>
          </div>
        )}
        {etichettaStato && (
          <div className="card-meta">
            <span className={etichettaStato === 'Esaurito' || evento.statoDisponibilita === 'ESAURITO' ? 'posti-basso' : ''}>
              {etichettaStato}
            </span>
          </div>
        )}
        <div className="card-foot">
          {prezzo && posti !== 0 && <span style={{ fontSize: 'var(--testo-md)', fontWeight: 700 }}>{prezzo}</span>}
          <span className="card-cta">
            {posti === 0 ? "Lista d'attesa" : 'Prenota'}
          </span>
        </div>
      </div>
    </Link>
  );
}
