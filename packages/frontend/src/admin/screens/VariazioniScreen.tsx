import { useEffect, useState } from 'react';
import { variazioniAdminApi, type Variazione } from '../../api/variazioni';
import { pagineApi } from '../../api/pagine';
import { PanelHead } from '../shared/PanelHead';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';

/** Elenco delle variazioni (cambio città/indirizzo/orario di una
 *  fermata già venduta) e come i clienti toccati hanno risposto — non
 *  ha azioni proprie: un eventuale rimborso richiesto dal cliente
 *  compare già in "Rimborsi", segnalato come "da variazione" (priorità
 *  diversa, ma approvazione sempre manuale, come deciso). Questa
 *  schermata serve solo a vedere lo stato di ogni variazione a colpo
 *  d'occhio, non a gestire nulla direttamente. */
export function VariazioniScreen() {
  const [lista, setLista] = useState<Variazione[] | null>(null);
  const [soloInCorso, setSoloInCorso] = useState(true);
  // Stesso sistema già usato ovunque nel gestionale (es. scheda evento)
  // per i tooltip modificabili da Sistema → Testi tooltip — prima
  // questo testo era passato come stringa fissa a PanelHead, senza
  // nessun collegamento al sistema modificabile, motivo per cui non
  // compariva lì per essere cambiato. PanelHead avvolge già "info" nel
  // suo InfoTooltip interno — basta passargli il testo risolto (non
  // serve un componente a parte).
  const [mappaTooltip, setMappaTooltip] = useState<Record<string, string>>({});

  useEffect(() => {
    variazioniAdminApi.list().then(setLista);
    pagineApi.listContenuti().then((lista) => {
      const mappa: Record<string, string> = {};
      for (const c of lista) if (c.chiave.startsWith('tooltip_')) mappa[c.chiave.slice(8)] = c.valore;
      setMappaTooltip(mappa);
    });
  }, []);

  const filtrata = (lista ?? []).filter((v) => !soloInCorso || v.stato === 'IN_CORSO');

  return (
    <div>
      <PanelHead titolo="Variazioni" info={mappaTooltip.variazioni_intro ?? TOOLTIP_DEFAULT.variazioni_intro} />

      <div className="mini-tabs" style={{ marginBottom: 18 }}>
        <button type="button" className={`mini-tab${soloInCorso ? ' active' : ''}`} onClick={() => setSoloInCorso(true)}>In corso</button>
        <button type="button" className={`mini-tab${!soloInCorso ? ' active' : ''}`} onClick={() => setSoloInCorso(false)}>Tutte</button>
      </div>

      {lista === null && <p className="testo-intro">Carico...</p>}
      {lista !== null && filtrata.length === 0 && <p className="testo-intro">Nessuna variazione {soloInCorso ? 'in corso' : 'ancora'}.</p>}

      {filtrata.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrata.map((v) => (
            <div key={v.id} className="section-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{v.fermataDescrizione}</p>
                  <p className="section-sub" style={{ marginBottom: 8 }}>{v.descrizione}</p>
                  <p style={{ fontSize: 12, color: 'var(--mist)' }}>{new Date(v.creataIl).toLocaleString('it-IT')}</p>
                </div>
                <span className={`badge ${v.stato === 'IN_CORSO' ? 'attenzione' : 'neutro'}`} style={{ flexShrink: 0 }}>
                  {v.stato === 'IN_CORSO' ? '◔ In corso' : '✓ Gestita'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <span className="chip">{v.totaleClienti} client{v.totaleClienti === 1 ? 'e' : 'i'} toccat{v.totaleClienti === 1 ? 'o' : 'i'}</span>
                {v.rispostoAccettato > 0 && <span className="chip">✓ {v.rispostoAccettato} accettat{v.rispostoAccettato === 1 ? 'a' : 'e'}</span>}
                {v.rispostoRimborso > 0 && <span className="badge non-coperta">{v.rispostoRimborso} rimbors{v.rispostoRimborso === 1 ? 'o' : 'i'} richiest{v.rispostoRimborso === 1 ? 'o' : 'i'}</span>}
                {v.inAttesa > 0 && <span className="chip">{v.inAttesa} in attesa di risposta</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
