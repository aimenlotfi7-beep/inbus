import { useEffect, useState } from 'react';
import { collaboratoriApi, NOMI_TIPO_COMPENSO, type CompensoEvento, type PossibileResponsabile, type TipoCompenso } from '../../../api/collaboratori';
import { notifica } from '../../shared/notifiche';
import { conferma } from '../../shared/conferma';
import { motivoErrore } from '../../shared/errori';
import { formattaData, formattaEuro } from '../../../shared/formato';
import { useNavigazione } from '../../shared/NavigazioneContext';

/** Scheda evento › Responsabile (proprietario, settembre 2026): chi gestisce
 *  l'evento per conto tuo e con quale compenso, fisso o in percentuale
 *  sull'incasso o sul margine. Il compenso è una spesa dell'evento (nelle
 *  Statistiche è già tolto dal margine). Permesso collaboratori.gestisci. */
export function ResponsabileTab({ eventoId }: { eventoId: string }) {
  const vaiA = useNavigazione();
  const [attuale, setAttuale] = useState<CompensoEvento | null | undefined>(undefined);
  const [responsabili, setResponsabili] = useState<PossibileResponsabile[]>([]);
  const [amministratoreId, setAmministratoreId] = useState('');
  const [tipo, setTipo] = useState<TipoCompenso>('FISSO');
  const [valore, setValore] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState('');

  function ricarica() {
    Promise.all([collaboratoriApi.diEvento(eventoId), collaboratoriApi.responsabili()])
      .then(([voce, elenco]) => {
        setAttuale(voce);
        setResponsabili(elenco);
        setAmministratoreId(voce?.amministratoreId ?? elenco.find((r) => r.soloEventiAssegnati)?.id ?? elenco[0]?.id ?? '');
        setTipo(voce?.compensoTipo ?? 'FISSO');
        setValore(voce && voce.compensoValore > 0 ? String(voce.compensoValore).replace('.', ',') : '');
        setErrore('');
      })
      .catch((e) => setErrore(`Responsabile non caricato: ${motivoErrore(e)}`));
  }
  useEffect(ricarica, [eventoId]);

  const numero = Number(valore.replace(/\./g, '').replace(',', '.'));
  const valoreValido = valore.trim() !== '' && Number.isFinite(numero) && numero >= 0 && (tipo === 'FISSO' || numero <= 100);

  async function salva() {
    if (!amministratoreId) { notifica('Scegli chi è il responsabile.', 'errore'); return; }
    if (!valoreValido) { notifica(tipo === 'FISSO' ? 'Scrivi il compenso in euro.' : 'Scrivi una percentuale da 0 a 100.', 'errore'); return; }
    if (attuale?.pagatoIl && !(await conferma({
      titolo: 'Il compenso risulta già pagato',
      testo: 'Salvando le modifiche il segno di "pagato" si toglie: il compenso tornerà da pagare con i valori nuovi.',
      conferma: 'Salva lo stesso',
    }))) return;
    setSalvando(true);
    try {
      const voce = await collaboratoriApi.assegna(eventoId, { amministratoreId, compensoTipo: tipo, compensoValore: numero });
      setAttuale(voce);
      notifica(`${voce.responsabile} è il responsabile di questo evento (${voce.regola}).`, 'successo');
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  async function togli() {
    if (!attuale) return;
    const ok = await conferma({
      titolo: `Togliere ${attuale.responsabile} da questo evento?`,
      testo: 'Non avrà più il compenso per questo evento e, se vede solo i suoi eventi, questo sparirà dal suo gestionale.',
      conferma: 'Togli il responsabile',
      pericolosa: true,
    });
    if (!ok) return;
    try {
      await collaboratoriApi.togli(eventoId);
      notifica('Responsabile tolto.', 'successo');
      ricarica();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  if (errore) return <p className="avviso avviso-errore" role="alert">{errore} <button type="button" className="btn btn-ghost btn-piccolo" onClick={ricarica}>Riprova</button></p>;
  if (attuale === undefined) return <p className="testo-intro">Carico…</p>;

  return (
    <div className="responsabile-evento">
      <p className="testo-intro">
        Il responsabile gestisce l'evento per conto tuo: se nella sua utenza è attivo «vede solo gli eventi di cui è
        responsabile», nel gestionale trova solo questo e gli altri eventi che gli assegni. Il compenso è una spesa
        dell'evento: nelle Statistiche è già tolto dal margine.
      </p>

      {attuale && (
        <div className="riepilogo-numeri">
          <div className="riepilogo-numero"><span>Responsabile</span><b>{attuale.responsabile}</b><small>{attuale.regola}</small></div>
          <div className="riepilogo-numero"><span>Compenso previsto</span><b>{formattaEuro(attuale.previsto)}</b><small>{attuale.compensoTipo === 'FISSO' ? 'cifra fissa' : 'sul valore delle prenotazioni'}</small></div>
          <div className="riepilogo-numero"><span>{attuale.concluso ? 'Compenso definitivo' : 'Maturato a oggi'}</span><b>{formattaEuro(attuale.aOggi)}</b><small>{attuale.compensoTipo === 'FISSO' ? 'non cambia con le vendite' : 'su quanto è stato pagato davvero'}</small></div>
          <div className="riepilogo-numero"><span>Pagamento</span><b>{attuale.pagatoIl ? formattaEuro(attuale.importoPagato ?? 0) : 'Da pagare'}</b><small>{attuale.pagatoIl ? `pagato il ${formattaData(attuale.pagatoIl)}` : 'si segna da Compensi collaboratori'}</small></div>
        </div>
      )}

      {responsabili.length === 0 ? (
        <p className="avviso">
          Non c'è ancora nessuna utenza che possa fare da responsabile: creala in Amministratori (non può essere un proprietario).{' '}
          <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => vaiA('amministratori')}>Vai ad Amministratori</button>
        </p>
      ) : (
        <div className="section-card">
          <div className="campi-responsabile">
            <div className="campo">
              <label htmlFor="resp-chi">Responsabile</label>
              <select id="resp-chi" value={amministratoreId} onChange={(e) => setAmministratoreId(e.target.value)}>
                {responsabili.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.soloEventiAssegnati ? ' (collaboratore)' : ''}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="resp-tipo">Compenso</label>
              <select id="resp-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCompenso)}>
                {(Object.keys(NOMI_TIPO_COMPENSO) as TipoCompenso[]).map((t) => <option key={t} value={t}>{NOMI_TIPO_COMPENSO[t]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="resp-valore">{tipo === 'FISSO' ? 'Importo (€)' : 'Percentuale (%)'}</label>
              <input id="resp-valore" inputMode="decimal" value={valore} placeholder={tipo === 'FISSO' ? 'es. 300' : 'es. 8'} onChange={(e) => setValore(e.target.value)} />
            </div>
          </div>
          <p className="testo-secondario" style={{ margin: '0 0 14px' }}>
            {tipo === 'FISSO' && 'Una cifra fissa per tutto l\'evento, qualunque sia il risultato.'}
            {tipo === 'PERCENTUALE_INCASSO' && 'Sul valore delle prenotazioni confermate, tolti cancellazioni e rimborsi. Matura anche se l\'evento è in perdita.'}
            {tipo === 'PERCENTUALE_MARGINE' && 'Sul margine dell\'evento: incasso meno bus, commissioni dei promoter e quote White Label. Niente compenso se l\'evento è in perdita.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Salvo…' : attuale ? 'Salva le modifiche' : 'Assegna l\'evento'}</button>
            {attuale && <button type="button" className="btn btn-ghost" onClick={togli} disabled={salvando}>Togli il responsabile</button>}
          </div>
        </div>
      )}
    </div>
  );
}
