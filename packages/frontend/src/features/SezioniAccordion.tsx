import { useState } from 'react';
import type { Evento } from '../api/types';

type Voce = 'descrizione' | 'informazioni';

/** Descrizione e Informazioni racchiuse in pulsanti — invece di
 *  mostrare tutto sempre aperto (pagina lunga da scorrere), ognuno
 *  apre solo la propria sezione. La sezione "Partenze" (che c'era
 *  qui) è stata tolta — il percorso completo si vede ora dentro il
 *  checkout, cliccando sulla fermata scelta (più utile lì: mostra
 *  solo il tragitto pertinente, con la fermata scelta evidenziata,
 *  proprio mentre stai prenotando). */
export function SezioniAccordion({ evento }: { evento: Evento }) {
  const [aperta, setAperta] = useState<Voce | null>(null);

  const voci: { id: Voce; etichetta: string; visibile: boolean }[] = [
    { id: 'descrizione', etichetta: 'Descrizione', visibile: !!evento.descrizioneSeo },
    { id: 'informazioni', etichetta: 'Informazioni', visibile: !!evento.descrizione },
  ];

  function toggle(id: Voce) {
    setAperta((prev) => (prev === id ? null : id));
  }

  return (
    <div className="accordion-evento">
      <div className="accordion-evento-pulsanti">
        {voci.filter((v) => v.visibile).map((v) => (
          <button
            key={v.id}
            type="button"
            className={`btn btn-ghost${aperta === v.id ? ' active' : ''}`}
            onClick={() => toggle(v.id)}
          >
            {v.etichetta} {aperta === v.id ? '▾' : '▸'}
          </button>
        ))}
      </div>

      {aperta === 'descrizione' && (
        <div className="sezione-info">{evento.descrizioneSeo}</div>
      )}
      {aperta === 'informazioni' && (
        <div className="sezione-info">{evento.descrizione}</div>
      )}
    </div>
  );
}
