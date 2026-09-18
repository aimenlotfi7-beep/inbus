import { useEffect, useState } from 'react';
import { collaboratoriApi, type CompensoEvento, type MioCompenso } from '../../api/collaboratori';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { notifica } from '../shared/notifiche';
import { confermaConTesto, conferma } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { formattaData, formattaEuro } from '../../shared/formato';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

/** Compensi dei responsabili operativi degli eventi (proprietario,
 *  settembre 2026). Il responsabile e il compenso si scelgono nella scheda
 *  dell'evento (da qui con «Assegna un evento» e «Modifica», o dalla card
 *  in Eventi); qui si vedono tutti, quanto è previsto, quanto è maturato e
 *  cosa resta da pagare. Durante le vendite conta "previsto" (sul valore
 *  delle prenotazioni); a evento concluso il compenso è quello "a oggi", su
 *  quanto è stato pagato davvero. */
export function CompensiScreen() {
  const [lista, setLista] = useState<CompensoEvento[] | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [daAssegnare, setDaAssegnare] = useState('');
  const [aperto, setAperto] = useState<Evento | null>(null);

  function ricarica() {
    collaboratoriApi.compensi()
      .then((l) => { setLista(l); setErrore(''); })
      .catch((e) => setErrore(`Compensi non caricati: ${motivoErrore(e)}`));
    eventiApi.list().then(setEventi).catch(() => setEventi([]));
  }
  useEffect(ricarica, []);

  async function apri(eventoId: string) {
    try {
      setAperto(await eventiApi.getById(eventoId));
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  // Gli eventi in programma ancora senza responsabile, dal più vicino.
  const oggi = new Date();
  const conResponsabile = new Set((lista ?? []).map((c) => c.eventoId));
  const liberi = eventi
    .filter((ev) => new Date(ev.data) >= oggi && !conResponsabile.has(ev.id))
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  if (aperto) {
    return <SchedaEventoModale evento={aperto} tabIniziale="responsabile" soloQuestaTab onClose={() => { setAperto(null); setDaAssegnare(''); ricarica(); }} onSalvato={ricarica} />;
  }

  async function segnaPagato(c: CompensoEvento) {
    const importo = await confermaConTesto({
      titolo: `Segnare pagato il compenso di ${c.responsabile}?`,
      testo: <>Evento <b>{c.artista}</b> ({c.regola}). {c.concluso ? 'Compenso definitivo' : 'Compenso maturato finora'}: <b>{formattaEuro(c.aOggi)}</b>.</>,
      conferma: 'Segna pagato',
      campoTesto: { etichetta: 'Importo pagato (lascia vuoto per la cifra qui sopra)', placeholder: String(c.aOggi).replace('.', ',') },
    });
    if (importo === null) return;
    const numero = importo.trim() === '' ? undefined : Number(importo.replace(/\./g, '').replace(',', '.'));
    if (numero !== undefined && (!Number.isFinite(numero) || numero < 0)) {
      notifica("L'importo non è un numero valido.", 'errore');
      return;
    }
    setInCorso(c.eventoId);
    try {
      await collaboratoriApi.segnaPagato(c.eventoId, numero);
      notifica('Compenso segnato come pagato.', 'successo');
      ricarica();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorso(null);
    }
  }

  async function annullaPagato(c: CompensoEvento) {
    const ok = await conferma({ titolo: 'Togliere il segno di pagato?', testo: <>Il compenso di <b>{c.responsabile}</b> per <b>{c.artista}</b> torna da pagare.</>, conferma: 'Togli il segno' });
    if (!ok) return;
    setInCorso(c.eventoId);
    try {
      await collaboratoriApi.annullaPagato(c.eventoId);
      notifica('Il compenso è di nuovo da pagare.', 'successo');
      ricarica();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div>
      <PanelHead titolo="Compensi collaboratori" />
      <p className="testo-intro">
        Chi gestisce un evento per conto tuo e con quale compenso: fisso, in percentuale sull'incasso o sul margine. Si sceglie
        qui sotto o con «Responsabile» sulla card dell'evento in Eventi. Il compenso è una spesa dell'evento e nelle
        Statistiche è già tolto dal margine.
      </p>
      <div className="assegna-evento">
        <label htmlFor="assegna-evento">Assegna un evento</label>
        <select id="assegna-evento" value={daAssegnare} onChange={(e) => setDaAssegnare(e.target.value)}>
          <option value="">{liberi.length ? 'Scegli un evento in programma…' : 'Tutti gli eventi in programma hanno un responsabile'}</option>
          {liberi.map((ev) => <option key={ev.id} value={ev.id}>{ev.artista} · {ev.citta} · {formattaData(ev.data)}</option>)}
        </select>
        <button type="button" className="btn btn-primary" disabled={!daAssegnare} onClick={() => apri(daAssegnare)}>Scegli il responsabile</button>
      </div>
      {errore && <p className="avviso avviso-errore" role="alert">{errore} <button type="button" className="btn btn-ghost btn-piccolo" onClick={ricarica}>Riprova</button></p>}
      {!errore && lista === null && <p className="testo-intro">Carico…</p>}
      {lista && lista.length === 0 && <p className="testo-intro">Nessun evento ha ancora un responsabile.</p>}
      {lista && lista.length > 0 && (
        <>
          <RiepilogoCompensi compensi={lista} />
          <div className="table-scroll adattiva">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Responsabile</th>
                  <th>Compenso</th>
                  <th style={{ textAlign: 'right' }}>Previsto</th>
                  <th style={{ textAlign: 'right' }}>Maturato</th>
                  <th>Stato</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.eventoId}>
                    <td><b>{c.artista}</b><br /><span className="testo-secondario">{c.citta} · {formattaData(c.data)}</span></td>
                    <td>{c.responsabile}</td>
                    <td>{c.regola}</td>
                    <td style={{ textAlign: 'right' }}>{formattaEuro(c.previsto)}</td>
                    <td style={{ textAlign: 'right' }}><b>{formattaEuro(c.aOggi)}</b>{c.concluso && <><br /><span className="testo-secondario">definitivo</span></>}</td>
                    <td><StatoCompenso compenso={c} /></td>
                    <td className="azioni-riga">
                      <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => apri(c.eventoId)}>Modifica</button>
                      {c.pagatoIl
                        ? <button type="button" className="btn btn-ghost btn-piccolo" disabled={inCorso === c.eventoId} onClick={() => annullaPagato(c)}>Togli pagato</button>
                        : <button type="button" className="btn btn-ghost btn-piccolo" disabled={inCorso === c.eventoId || c.aOggi <= 0} onClick={() => segnaPagato(c)}>Segna pagato</button>}
                    </td>
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

/** Da pagare (eventi conclusi non ancora pagati), in corso e già pagato. */
export function RiepilogoCompensi({ compensi, perCollaboratore = false }: { compensi: MioCompenso[]; perCollaboratore?: boolean }) {
  const daPagare = compensi.filter((c) => c.concluso && !c.pagatoIl).reduce((s, c) => s + c.aOggi, 0);
  const inCorso = compensi.filter((c) => !c.concluso).reduce((s, c) => s + c.previsto, 0);
  const pagato = compensi.filter((c) => c.pagatoIl).reduce((s, c) => s + (c.importoPagato ?? 0), 0);
  return (
    <div className="riepilogo-numeri">
      <div className="riepilogo-numero"><span>{perCollaboratore ? 'Da ricevere' : 'Da pagare'}</span><b>{formattaEuro(daPagare)}</b><small>eventi conclusi</small></div>
      <div className="riepilogo-numero"><span>Previsto sugli eventi in corso</span><b>{formattaEuro(inCorso)}</b><small>può ancora cambiare con le vendite</small></div>
      <div className="riepilogo-numero"><span>{perCollaboratore ? 'Già ricevuto' : 'Già pagato'}</span><b>{formattaEuro(pagato)}</b></div>
    </div>
  );
}

export function StatoCompenso({ compenso }: { compenso: MioCompenso }) {
  if (compenso.pagatoIl) return <span className="badge coperta" title={`Pagato il ${formattaData(compenso.pagatoIl)}`}>Pagato {formattaEuro(compenso.importoPagato ?? 0)}</span>;
  if (compenso.concluso) return <span className="badge attenzione">Da pagare</span>;
  return <span className="badge">Evento in corso</span>;
}
