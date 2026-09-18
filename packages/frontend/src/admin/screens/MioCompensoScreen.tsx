import { useEffect, useState } from 'react';
import { collaboratoriApi, type MioCompenso } from '../../api/collaboratori';
import { PanelHead } from '../shared/PanelHead';
import { motivoErrore } from '../shared/errori';
import { formattaData, formattaEuro } from '../../shared/formato';
import { RiepilogoCompensi, StatoCompenso } from './CompensiScreen';

/** "Il mio compenso": per chi è responsabile di uno o più eventi. Solo il
 *  suo compenso, evento per evento: niente incassi, costi e margini
 *  (regola del proprietario, settembre 2026). */
export function MioCompensoScreen() {
  const [lista, setLista] = useState<MioCompenso[] | null>(null);
  const [errore, setErrore] = useState('');

  function ricarica() {
    collaboratoriApi.miei()
      .then((l) => { setLista(l); setErrore(''); })
      .catch((e) => setErrore(`Compensi non caricati: ${motivoErrore(e)}`));
  }
  useEffect(ricarica, []);

  return (
    <div>
      <PanelHead titolo="Il mio compenso" />
      <p className="testo-intro">
        Durante le vendite vedi il compenso previsto, che cresce o cala con le prenotazioni. A evento concluso diventa
        definitivo, calcolato su quanto è stato pagato davvero.
      </p>
      {errore && <p className="avviso avviso-errore" role="alert">{errore} <button type="button" className="btn btn-ghost btn-piccolo" onClick={ricarica}>Riprova</button></p>}
      {!errore && lista === null && <p className="testo-intro">Carico…</p>}
      {lista && lista.length === 0 && <p className="testo-intro">Non sei ancora responsabile di nessun evento.</p>}
      {lista && lista.length > 0 && (
        <>
          <RiepilogoCompensi compensi={lista} perCollaboratore />
          <div className="table-scroll adattiva">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Compenso</th>
                  <th style={{ textAlign: 'right' }}>Previsto</th>
                  <th style={{ textAlign: 'right' }}>Maturato</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.eventoId}>
                    <td><b>{c.artista}</b><br /><span className="testo-secondario">{c.citta} · {formattaData(c.data)}</span></td>
                    <td>{c.compensoValore === 0 && c.compensoTipo === 'FISSO' ? <span className="testo-secondario">Da definire</span> : c.regola}</td>
                    <td style={{ textAlign: 'right' }}>{formattaEuro(c.previsto)}</td>
                    <td style={{ textAlign: 'right' }}><b>{formattaEuro(c.aOggi)}</b>{c.concluso && <><br /><span className="testo-secondario">definitivo</span></>}</td>
                    <td><StatoCompenso compenso={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
