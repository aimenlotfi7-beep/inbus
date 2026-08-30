import type { Evento } from '../api/types';

const SOGLIA_ULTIMI_POSTI = 5;

function postiRealiFermata(fermata: { postiMax: number | null; postiPrenotati: number }, postiTragitto: number) {
  if (fermata.postiMax !== null) return Math.max(0, fermata.postiMax - fermata.postiPrenotati);
  return postiTragitto;
}

function EtichettaDisponibilita({ posti }: { posti: number }) {
  // Dicitura generica, non il numero esatto — solo lo stato.
  if (posti === 0) return <span className="percorso-posti esaurito">Esaurito</span>;
  if (posti <= SOGLIA_ULTIMI_POSTI) return <span className="percorso-posti pochi">Pochi posti disponibili</span>;
  return <span className="percorso-posti disponibile">Posti disponibili</span>;
}

/** Le partenze — un unico elenco (non più diviso per tratta), ordinato
 *  per orario crescente: più facile da leggere quando ci sono più
 *  tratte insieme. Disponibilità reale (calcolata dai posti già
 *  prenotati) ma con dicitura generica, non il numero esatto.
 *
 *  "soloTragittoId" e "fermataEvidenziataId" sono facoltativi — usati
 *  dal popup nel checkout per mostrare SOLO il tragitto scelto (non
 *  tutti mischiati) con la fermata scelta messa in risalto. Senza
 *  questi due, il comportamento resta quello di sempre (tutte le
 *  tappe di tutti i tragitti, nessuna evidenziata). */
export function PercorsoBus({ evento, soloTragittoId, fermataEvidenziataId }: { evento: Evento; soloTragittoId?: string; fermataEvidenziataId?: string }) {
  // Deduplicato per id — se lo stesso tragitto finisse per sbaglio sia
  // tra quelli "liberi" dell'evento sia annidato dentro un servizio
  // (dato arrivato così dal server), qui non conterebbe comunque due
  // volte: ogni tragitto compare al massimo una sola volta.
  const mappaTragitti = new Map<string, Evento['tragitti'][number]>();
  for (const t of [...evento.tragitti, ...evento.servizi.flatMap((v) => v.tragitti)]) mappaTragitti.set(t.id, t);
  const tuttiITragitti = [...mappaTragitti.values()];
  if (!tuttiITragitti.length) return null;

  const tragittiDaMostrare = soloTragittoId ? tuttiITragitti.filter((t) => t.id === soloTragittoId) : tuttiITragitti;

  // Stessa idea anche sulle singole fermate — mai due righe con lo
  // stesso id, qualunque sia la causa a monte del doppione.
  const mappaTappe = new Map<string, { id: string; citta: string; orario: string | null; posti: number; nomeTragitto: string }>();
  for (const tragitto of tragittiDaMostrare) {
    for (const f of tragitto.fermate) {
      mappaTappe.set(f.id, { ...f, posti: postiRealiFermata(f, tragitto.postiDisponibili), nomeTragitto: tragitto.nome });
    }
  }
  const tappe = [...mappaTappe.values()].sort((a, b) => (a.orario ?? '99:99').localeCompare(b.orario ?? '99:99'));

  // L'arrivo vive sul tragitto, non più sull'evento — con un solo
  // tragitto mostrato (il caso "soloTragittoId") è sempre quello
  // giusto; con più tragitti mischiati (vista generica, nessun
  // filtro) lo mostro solo se tutti condividono lo stesso orario,
  // altrimenti sarebbe fuorviante mostrarne uno a caso.
  const orariArrivoDistinti = [...new Set(tragittiDaMostrare.map((t) => t.arrivoOrario).filter((o): o is string => !!o))];
  const arrivoDaMostrare = orariArrivoDistinti.length === 1 ? orariArrivoDistinti[0] : null;

  return (
    <div className="percorso-bus-blocco">
      <div className="percorso-tappe">
        {tappe.map((f) => (
          <div className={`percorso-tappa${f.id === fermataEvidenziataId ? ' evidenziata' : ''}`} key={f.id}>
            <div className="percorso-tappa-puntino" />
            <div className="percorso-tappa-corpo">
              <b>{f.citta}</b>
              {f.orario && <span className="percorso-orario">{f.orario}</span>}
              <EtichettaDisponibilita posti={f.posti} />
            </div>
          </div>
        ))}
        <div className="percorso-tappa percorso-tappa-arrivo">
          <div className="percorso-tappa-puntino arrivo" />
          <div className="percorso-tappa-corpo">
            <b>{evento.citta} — {evento.luogo}</b>
            {arrivoDaMostrare && <span className="percorso-orario">{arrivoDaMostrare}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
