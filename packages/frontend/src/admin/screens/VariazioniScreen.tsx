import { useEffect, useState } from 'react';
import { variazioniAdminApi, type Variazione } from '../../api/variazioni';
import { PanelHead } from '../shared/PanelHead';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';
import { motivoErrore } from '../shared/errori';
import { formattaData, formattaDataOra, plurale } from '../../shared/formato';

/** I dati che dicono DI QUALE viaggio si parla: prima la card mostrava
 *  solo la fermata ("Bologna"), impossibile da riconoscere con più eventi. */
type VariazioneConViaggio = Variazione & { eventoArtista?: string; eventoData?: string; tragittoNome?: string };

/** Elenco delle variazioni (cambio di data, luogo, fermata o orario di un
 *  viaggio già venduto) e come i clienti avvisati hanno risposto — non
 *  ha azioni proprie: un eventuale rimborso richiesto dal cliente
 *  compare già in "Rimborsi", segnalato come "da variazione" (priorità
 *  diversa, ma approvazione sempre manuale, come deciso). Questa
 *  schermata serve solo a vedere lo stato di ogni variazione a colpo
 *  d'occhio, non a gestire nulla direttamente. */
export function VariazioniScreen() {
  const [lista, setLista] = useState<VariazioneConViaggio[] | null>(null);
  const [errore, setErrore] = useState('');
  const [soloInCorso, setSoloInCorso] = useState(true);
  const mappaTooltip = useMappaTooltip();

  function carica() {
    setErrore('');
    variazioniAdminApi.list()
      .then(setLista)
      .catch((e) => setErrore(`Impossibile caricare le variazioni: ${motivoErrore(e)}`));
  }
  useEffect(carica, []);

  const filtrata = (lista ?? []).filter((v) => !soloInCorso || v.stato === 'IN_CORSO');

  return (
    <div>
      <PanelHead titolo="Variazioni" info={mappaTooltip.variazioni_intro ?? TOOLTIP_DEFAULT.variazioni_intro} />

      <div className="mini-tabs" style={{ marginBottom: 18 }}>
        <button type="button" className={`mini-tab${soloInCorso ? ' active' : ''}`} onClick={() => setSoloInCorso(true)}>In corso</button>
        <button type="button" className={`mini-tab${!soloInCorso ? ' active' : ''}`} onClick={() => setSoloInCorso(false)}>Tutte</button>
      </div>

      {errore && (
        <div style={{ marginBottom: 16 }}>
          <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>
          <button type="button" className="btn btn-ghost" onClick={carica}>Riprova</button>
        </div>
      )}
      {!errore && lista === null && <p className="testo-intro">Carico…</p>}
      {lista !== null && filtrata.length === 0 && <p className="testo-intro">Nessuna variazione {soloInCorso ? 'in corso' : 'ancora'}.</p>}

      {filtrata.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrata.map((v) => {
            const viaggio = [
              v.eventoData ? formattaData(v.eventoData) : '',
              v.tragittoNome ?? '',
              v.eventoArtista && v.fermataDescrizione ? `fermata di ${v.fermataDescrizione}` : '',
            ].filter(Boolean).join(' · ');
            return (
              <div key={v.id} className="section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>{v.eventoArtista || v.fermataDescrizione}</p>
                    {viaggio && <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', marginBottom: 6 }}>{viaggio}</p>}
                    <p className="section-sub" style={{ marginBottom: 8 }}>{v.descrizione}</p>
                    <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)' }}>Comunicata il {formattaDataOra(v.creataIl)}</p>
                  </div>
                  <span className={`badge ${v.stato === 'IN_CORSO' ? 'badge-stato-arancio' : 'badge-stato-verde'}`} style={{ flexShrink: 0 }}>
                    {v.stato === 'IN_CORSO' ? 'In corso' : 'Gestita'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <span className="chip">{plurale(v.totaleClienti, 'cliente avvisato', 'clienti avvisati')}</span>
                  {v.rispostoAccettato > 0 && <span className="chip">{plurale(v.rispostoAccettato, 'ha accettato', 'hanno accettato')}</span>}
                  {v.rispostoRimborso > 0 && <span className="badge non-coperta">{plurale(v.rispostoRimborso, 'rimborso richiesto', 'rimborsi richiesti')}</span>}
                  {v.inAttesa > 0 && <span className="chip">{v.inAttesa} in attesa di risposta</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
