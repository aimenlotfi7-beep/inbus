import { useEffect, useRef, useState } from 'react';

export interface VoceMenu {
  testo: string;
  onClick: () => void;
  /** In rosso: per azioni che cancellano o non si annullano. */
  pericolosa?: boolean;
}

/** Il pulsante "…" con le azioni meno frequenti di una riga o di una
 *  scheda (escludi fermata, modifica percorso, elimina…): restano a
 *  portata di mano senza affollare la pagina accanto a quelle di tutti
 *  i giorni. Si chiude cliccando fuori, con Esc o scegliendo una voce. */
export function MenuAzioni({ voci, etichetta = 'Altre azioni' }: { voci: VoceMenu[]; etichetta?: string }) {
  const [aperto, setAperto] = useState(false);
  const contenitore = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aperto) return;
    function clicFuori(e: MouseEvent) {
      if (!contenitore.current?.contains(e.target as Node)) setAperto(false);
    }
    function tasto(e: KeyboardEvent) {
      if (e.key === 'Escape') setAperto(false);
    }
    document.addEventListener('mousedown', clicFuori);
    document.addEventListener('keydown', tasto);
    return () => {
      document.removeEventListener('mousedown', clicFuori);
      document.removeEventListener('keydown', tasto);
    };
  }, [aperto]);

  return (
    <div ref={contenitore} className="menu-azioni">
      <button
        type="button" className="btn btn-ghost btn-piccolissimo"
        aria-label={etichetta} title={etichetta} aria-haspopup="menu" aria-expanded={aperto}
        onClick={() => setAperto((v) => !v)}
      >
        …
      </button>
      {aperto && (
        <div className="menu-azioni-voci" role="menu">
          {voci.map((voce) => (
            <button
              key={voce.testo} type="button" role="menuitem"
              className={voce.pericolosa ? 'pericolosa' : undefined}
              onClick={() => { setAperto(false); voce.onClick(); }}
            >
              {voce.testo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
