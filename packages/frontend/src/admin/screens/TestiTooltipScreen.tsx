import { useEffect, useState } from 'react';
import { pagineApi } from '../../api/pagine';
import { PanelHead } from '../shared/PanelHead';
import { TOOLTIP_DEFAULT, TOOLTIP_ETICHETTA } from '../tooltipDefaults';

/** Ogni tooltip della scheda evento (e in futuro di altre schermate)
 *  ha un testo di default scritto nel codice — qui si può sovrascrivere
 *  quel testo senza toccare il codice. Stesso identico sistema già
 *  usato per i testi configurabili della homepage (tabella
 *  "contenuti"), solo con la chiave prefissata "tooltip_" per tenerli
 *  separati dal resto. Lasciare vuoto un campo e salvare torna al
 *  testo di default. */
export function TestiTooltipScreen() {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    pagineApi.listContenuti().then((lista) => {
      const mappa: Record<string, string> = {};
      for (const c of lista) if (c.chiave.startsWith('tooltip_')) mappa[c.chiave.slice(8)] = c.valore;
      setValori(mappa);
      setCaricamento(false);
    });
  }, []);

  async function salva(chiave: string, testo: string) {
    setSalvando((s) => ({ ...s, [chiave]: true }));
    try {
      await pagineApi.upsertContenuto(`tooltip_${chiave}`, testo);
      setValori((v) => ({ ...v, [chiave]: testo }));
    } finally {
      setSalvando((s) => ({ ...s, [chiave]: false }));
    }
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;

  return (
    <div>
      <PanelHead titolo="Testi tooltip" />
      <p className="testo-intro" style={{ marginBottom: 20 }}>
        Il testo che vedi in ogni campo sotto è quello mostrato oggi (personalizzato, se lo hai già modificato — altrimenti il default). Lascialo vuoto e salva per tornare al default.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.keys(TOOLTIP_DEFAULT).map((chiave) => (
          <RigaTooltip
            key={chiave}
            chiave={chiave}
            etichetta={TOOLTIP_ETICHETTA[chiave] ?? chiave}
            valoreIniziale={valori[chiave] ?? TOOLTIP_DEFAULT[chiave]}
            salvando={!!salvando[chiave]}
            onSalva={(testo) => salva(chiave, testo)}
          />
        ))}
      </div>
    </div>
  );
}

function RigaTooltip({ etichetta, valoreIniziale, salvando, onSalva }: {
  chiave: string; etichetta: string; valoreIniziale: string; salvando: boolean; onSalva: (testo: string) => void;
}) {
  const [testo, setTesto] = useState(valoreIniziale);
  const modificato = testo !== valoreIniziale;

  return (
    <div className="section-card">
      <p className="section-label" style={{ marginBottom: 8 }}>{etichetta}</p>
      <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={2} style={{ marginBottom: 8 }} />
      <button className="btn btn-ghost" disabled={!modificato || salvando} onClick={() => onSalva(testo)}>
        {salvando ? 'Salvo...' : 'Salva'}
      </button>
    </div>
  );
}
