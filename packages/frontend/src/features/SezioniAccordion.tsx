import { useState } from 'react';
import type { Evento } from '../api/types';
import { PercorsoBus } from './PercorsoBus';

type Voce = 'descrizione' | 'informazioni' | 'partenze';

/** Descrizione, Informazioni e Partenze racchiuse in pulsanti — invece
 *  di mostrare tutto sempre aperto (pagina lunga da scorrere), ognuno
 *  apre solo la propria sezione. */
export function SezioniAccordion({ evento }: { evento: Evento }) {
  const [aperta, setAperta] = useState<Voce | null>(null);

  const voci: { id: Voce; etichetta: string; visibile: boolean }[] = [
    { id: 'descrizione', etichetta: 'Descrizione', visibile: !!evento.descrizioneSeo },
    { id: 'informazioni', etichetta: 'Informazioni', visibile: !!evento.descrizione },
    { id: 'partenze', etichetta: 'Partenze', visibile: evento.tragitti.length > 0 || evento.servizi.some((v) => v.tragitti.length > 0) },
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
      {aperta === 'partenze' && (
        <div className="sezione-info">
          <PercorsoBus evento={evento} />
        </div>
      )}
    </div>
  );
}
