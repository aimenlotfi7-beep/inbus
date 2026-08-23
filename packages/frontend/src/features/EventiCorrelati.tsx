import { useEffect, useState } from 'react';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { EventoCard } from './eventi/EventoCard';

/** "Ti potrebbe interessare anche" — eventi veri, futuri, dello stesso
 *  genere o nella stessa città (priorità allo stesso genere), esclude
 *  ovviamente l'evento che si sta già guardando. Nessun algoritmo
 *  complicato: solo dati reali che ci sono già. */
export function EventiCorrelati({ evento }: { evento: Evento }) {
  const [correlati, setCorrelati] = useState<Evento[]>([]);

  useEffect(() => {
    eventiApi.list({ soloFuturi: true, soloVisibili: true }).then((lista) => {
      const altri = lista.filter((e) => e.id !== evento.id);
      const stessoGenere = altri.filter((e) => e.genere === evento.genere);
      const stessaCitta = altri.filter((e) => e.genere !== evento.genere && e.citta === evento.citta);
      setCorrelati([...stessoGenere, ...stessaCitta].slice(0, 4));
    });
  }, [evento.id, evento.genere, evento.citta]);

  if (!correlati.length) return null;

  return (
    <section className="events-section correlati-sezione">
      <div className="section-head">
        <div>
          <h2 className="section-title">Ti potrebbe <em>interessare</em> anche</h2>
        </div>
      </div>
      <div className="grid">
        {correlati.map((ev) => <EventoCard key={ev.id} evento={ev} />)}
      </div>
    </section>
  );
}
