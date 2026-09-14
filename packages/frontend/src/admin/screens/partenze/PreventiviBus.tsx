import { useEffect, useState } from 'react';
import { preventiviApi, type FornitoreCandidato, type RichiestaConRisposta } from '../../../api/preventivi';
import type { Linea, PreventivoDelBus } from '../../../api/eventi';
import type { Tragitto } from '../../../api/types';
import { geocodifica } from '../../shared/geo';
import { notifica } from '../../shared/notifiche';
import { conferma } from '../../shared/conferma';
import { motivoErrore, ERRORE_MAPPE } from '../../shared/errori';
import { formattaEuro, plurale } from '../../../shared/formato';

/** Preventivi per il bus di UNA proposta da confermare (deciso dal
 *  proprietario, settembre 2026): quando le prenotazioni fanno nascere la
 *  proposta si chiedono i preventivi ai fornitori vicini alla prima fermata
 *  del bus; chi ha dato la quotazione del tragitto ha la precedenza (sempre
 *  in elenco, già selezionato). Scegliendo una risposta si apre la conferma
 *  del bus con fornitore, costo e posti già scritti: alla conferma il
 *  fornitore scelto riceve l'email e poi il file firmato, chi non è stato
 *  scelto l'avviso. Ogni bus può avere un fornitore diverso. */
export function PreventiviBus({ proposta, tragitto, puoScegliere, onScegli }: {
  proposta: Linea;
  tragitto: Tragitto;
  puoScegliere: boolean;
  /** Apre la conferma del bus con i dati della risposta scelta. */
  onScegli: (scelta: RichiestaConRisposta) => void;
}) {
  const [richieste, setRichieste] = useState<RichiestaConRisposta[] | undefined>();
  const [errore, setErrore] = useState('');
  const [candidati, setCandidati] = useState<FornitoreCandidato[] | undefined>();
  const [coordinate, setCoordinate] = useState<{ lat: number; lng: number } | null>(null);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [cercando, setCercando] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [reinviandoId, setReinviandoId] = useState<string | null>(null);

  function carica() {
    preventiviApi.listaPerProposta(proposta.id)
      .then((r) => { setRichieste(r); setErrore(''); })
      .catch((e) => setErrore(`Preventivi di questo bus non caricati: ${motivoErrore(e)}`));
  }
  useEffect(carica, [proposta.id]);

  const quotazione = tragitto.preventivoCosto ? Number(tragitto.preventivoCosto) : null;

  /** Dove parte il bus: la posizione già salvata del tragitto se il bus parte
   *  dalla sua prima fermata; se no l'indirizzo sulla mappa, e se non si
   *  trova almeno la città (i fornitori si cercano nel raggio di km). */
  async function posizioneFermata(fermata: Tragitto['fermate'][number]): Promise<{ coordinate: { lat: number; lng: number } | null; erroreRete?: boolean }> {
    const primaDelTragitto = tragitto.fermate.find((f) => f.attivo !== false);
    if (primaDelTragitto?.id === fermata.id && tragitto.partenzaLat != null && tragitto.partenzaLng != null) {
      return { coordinate: { lat: tragitto.partenzaLat, lng: tragitto.partenzaLng } };
    }
    if (fermata.indirizzo) {
      const conIndirizzo = await geocodifica(`${fermata.indirizzo}, ${fermata.citta}`);
      if (conIndirizzo.coordinate || conIndirizzo.erroreRete) return conIndirizzo;
    }
    return geocodifica(fermata.citta);
  }

  async function cercaFornitori() {
    const prima = tragitto.fermate.find((f) => f.id === proposta.fermate[0]?.fermataId);
    if (!prima) { notifica('Questo bus non ha fermate: ricarica la pagina.', 'errore'); return; }
    setCercando(true);
    try {
      const posizione = await posizioneFermata(prima);
      if (!posizione.coordinate) {
        notifica(posizione.erroreRete ? ERRORE_MAPPE : `La fermata di ${prima.citta} non si trova sulla mappa: controlla città e indirizzo in Eventi.`, 'errore');
        return;
      }
      const trovati = await preventiviApi.candidatiBus(proposta.id, posizione.coordinate.lat, posizione.coordinate.lng);
      setCoordinate(posizione.coordinate);
      setCandidati(trovati);
      // Precedenza a chi ha dato la quotazione: già selezionato.
      setSelezionati(new Set(trovati.filter((c) => c.statoCandidato === 'accettato_in_precedenza').map((c) => c.id)));
    } catch (e) {
      notifica(`Ricerca dei fornitori vicini non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setCercando(false);
    }
  }

  function chiudi() {
    setCandidati(undefined);
    setSelezionati(new Set());
  }

  async function invia() {
    if (!candidati || !coordinate) return;
    const destinatari = candidati.filter((c) => c.statoCandidato === 'automatico' || selezionati.has(c.id));
    if (destinatari.length === 0) { notifica('Seleziona almeno un fornitore prima di inviare la richiesta.', 'errore'); return; }
    const ok = await conferma({
      titolo: 'Chiedere i preventivi per questo bus?',
      testo: <>Riceveranno un'email con le fermate del bus ({proposta.fermate.map((f) => f.citta).join(' → ')}) e il link per rispondere con prezzo e posti: <b>{destinatari.map((c) => c.nome).join(', ')}</b>.</>,
      conferma: `Invia a ${plurale(destinatari.length, 'fornitore', 'fornitori')}`,
    });
    if (!ok) return;
    setInviando(true);
    try {
      const esito = await preventiviApi.richiediBus(proposta.id, { ...coordinate, fornitoriManualiIds: [...selezionati] });
      const inviate = esito.inviateAutomatiche + esito.inviateManuali;
      if (esito.nonInviate === 0 && esito.senzaEmail === 0) notifica(`Richiesta inviata a ${plurale(inviate, 'fornitore', 'fornitori')}.`, 'successo');
      else notifica(`Richiesta registrata, ma ${esito.nonInviate ? `${esito.nonInviate} email non sono partite` : ''}${esito.nonInviate && esito.senzaEmail ? ' e ' : ''}${esito.senzaEmail ? `${plurale(esito.senzaEmail, 'fornitore non ha', 'fornitori non hanno')} un indirizzo email` : ''}. Puoi reinviarla dall'elenco.`, 'errore');
      chiudi();
      carica();
    } catch (e) {
      notifica(`Invio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInviando(false);
    }
  }

  async function reinvia(r: RichiestaConRisposta) {
    setReinviandoId(r.richiestaId);
    try {
      const { inviata } = await preventiviApi.reinviaRichiesta(r.richiestaId);
      notifica(inviata ? `Richiesta inviata di nuovo a ${r.fornitoreNome}.` : `L'email per ${r.fornitoreNome} non è partita neanche questa volta.`, inviata ? 'successo' : 'errore');
      carica();
    } catch (e) {
      notifica(`Reinvio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setReinviandoId(null);
    }
  }

  const conRisposta = (richieste ?? []).filter((r) => r.risposta);
  const piuEconomico = conRisposta.length > 1 ? Math.min(...conRisposta.map((r) => Number(r.risposta!.prezzo))) : null;

  return (
    <div className="pannello-in-linea">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 700, margin: 0 }}>Preventivi per questo bus</p>
        {!candidati && (
          <button type="button" className={`btn ${richieste?.length ? 'btn-ghost' : 'btn-primary'} btn-piccolo`} disabled={cercando} onClick={cercaFornitori}>
            {cercando ? 'Cerco i fornitori vicini…' : richieste?.length ? '+ Chiedi ad altri fornitori' : 'Richiedi preventivi'}
          </button>
        )}
      </div>

      {candidati && (
        <div style={{ marginTop: 10 }}>
          {candidati.length === 0 && <p className="testo-intro">Nessun fornitore approvato vicino alla prima fermata: allarga il raggio in Impostazioni o registra un fornitore più vicino.</p>}
          {candidati.filter((c) => c.statoCandidato === 'automatico').length > 0 && (
            <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '0 0 6px' }}>
              Invio automatico a: {candidati.filter((c) => c.statoCandidato === 'automatico').map((c) => c.nome).join(', ')}
            </p>
          )}
          {candidati.filter((c) => c.statoCandidato !== 'automatico').map((c) => {
            const oscurato = c.statoCandidato === 'gia_contattato';
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', opacity: oscurato ? .45 : 1, cursor: oscurato ? 'default' : 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} disabled={oscurato} checked={selezionati.has(c.id)}
                  onChange={() => setSelezionati((prev) => { const s = new Set(prev); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); return s; })} />
                <span style={{ flex: 1 }}>{c.nome} <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({c.distanzaKm} km)</span></span>
                {c.statoCandidato === 'accettato_in_precedenza' && <span style={{ fontSize: 'var(--testo-xs)', color: 'var(--green)' }}>ha dato la quotazione · precedenza</span>}
                {oscurato && <span style={{ fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>già contattato per questo bus</span>}
              </label>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-piccolo" disabled={inviando || candidati.length === 0} onClick={invia}>{inviando ? 'Invio…' : 'Invia richiesta'}</button>
            <button type="button" className="btn btn-ghost btn-piccolo" onClick={chiudi}>Annulla</button>
          </div>
        </div>
      )}

      {errore ? (
        <p style={{ color: 'var(--pink)', margin: '8px 0 0' }}>{errore}</p>
      ) : !richieste ? (
        <p style={{ color: 'var(--mist)', margin: '8px 0 0' }}>Carico…</p>
      ) : richieste.length === 0 ? (
        <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', margin: '8px 0 0' }}>Nessun preventivo chiesto ancora per questo bus.</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead><tr><th>Fornitore</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Posti</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {richieste.map((r) => {
                const prezzo = r.risposta ? Number(r.risposta.prezzo) : null;
                const oltreQuotazione = prezzo != null && quotazione != null && prezzo > quotazione ? prezzo - quotazione : 0;
                return (
                  <tr key={r.richiestaId}>
                    <td>{r.fornitoreNome}{r.fornitore.id === tragitto.fornitoreId && <span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--green)' }}>ha dato la quotazione</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700 }}>{prezzo != null ? formattaEuro(prezzo) : '—'}</span>
                      {prezzo != null && prezzo === piuEconomico && <span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>più economico</span>}
                      {/* Avviso, non un blocco (deciso dal proprietario): i prezzi erano stati fatti sulla quotazione. */}
                      {oltreQuotazione > 0 && <span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: '#b45309' }}>{formattaEuro(oltreQuotazione)} più della quotazione</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.risposta?.postiBus ?? '—'}</td>
                    <td style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)' }}>
                      {r.risposta ? 'Ha risposto' : 'In attesa di risposta'}
                      {!r.risposta && r.linkScaduto && <span style={{ display: 'block', color: 'var(--pink)', fontSize: 'var(--testo-xs)' }}>link scaduto</span>}
                      {!r.fornitore.email && <span style={{ display: 'block', color: 'var(--pink)', fontSize: 'var(--testo-xs)' }}>fornitore senza email</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {!r.risposta && r.fornitore.email && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" disabled={!!reinviandoId} onClick={() => reinvia(r)}>{reinviandoId === r.richiestaId ? 'Invio…' : 'Reinvia'}</button>
                      )}
                      {r.risposta?.haFile && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" onClick={() => scaricaFile(r.risposta!.id, 'originale')}>Scarica file</button>
                      )}
                      {r.risposta && puoScegliere && (
                        <button type="button" className="btn btn-primary btn-piccolissimo" style={{ marginLeft: 6 }} onClick={() => onScegli(r)}>Scegli e conferma</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** L'allegato non viaggia con la lista (peserebbe MB per riga): lo si
 *  chiede al server solo al clic. */
async function scaricaFile(rispostaId: string, quale: 'originale' | 'firmato') {
  try {
    const { nome, contenuto } = await preventiviApi.scaricaFile(rispostaId, quale);
    const link = document.createElement('a');
    link.href = `data:application/octet-stream;base64,${contenuto}`;
    link.download = nome;
    link.click();
  } catch (e) {
    notifica(`Download non riuscito: ${motivoErrore(e)}`, 'errore');
  }
}

function fileABase64(f: File): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi((lettore.result as string).split(',')[1]);
    lettore.onerror = () => rifiuta(new Error('Lettura file fallita'));
    lettore.readAsDataURL(f);
  });
}

/** Sotto un bus confermato: il preventivo scelto, con il suo file e il file
 *  firmato da mandare al fornitore. */
export function PreventivoDelBusRiga({ preventivo, onCambiato }: { preventivo: PreventivoDelBus; onCambiato: () => void }) {
  const [inCorso, setInCorso] = useState(false);
  const firmatoNonPartito = preventivo.haFileFirmato && !preventivo.fileFirmatoInviatoIl;

  async function caricaFirmato(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Svuoto subito il campo: dopo un errore, scegliere di nuovo lo stesso file deve ripartire.
    input.value = '';
    if (!file) return;
    const ok = await conferma({
      titolo: 'Inviare il file firmato?',
      testo: <><b>{file.name}</b> verrà salvato e inviato subito via email a <b>{preventivo.fornitoreNome}</b>.</>,
      conferma: 'Carica e invia',
    });
    if (!ok) return;
    setInCorso(true);
    try {
      const { inviata } = await preventiviApi.caricaFileFirmato(preventivo.rispostaId, file.name, await fileABase64(file));
      notifica(inviata ? `File firmato inviato a ${preventivo.fornitoreNome}.` : `File firmato salvato, ma l'email per ${preventivo.fornitoreNome} non è partita: usa "Reinvia firmato".`, inviata ? 'successo' : 'errore');
      onCambiato();
    } catch (e) {
      notifica(`Caricamento non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorso(false);
    }
  }

  async function reinviaFirmato() {
    setInCorso(true);
    try {
      const { inviata } = await preventiviApi.reinviaFileFirmato(preventivo.rispostaId);
      notifica(inviata ? `File firmato inviato a ${preventivo.fornitoreNome}.` : `L'email con il file firmato per ${preventivo.fornitoreNome} non è partita.`, inviata ? 'successo' : 'errore');
      onCambiato();
    } catch (e) {
      notifica(`Reinvio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <p style={{ margin: '4px 0 0', fontSize: 'var(--testo-sm)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--mist)' }}>Preventivo di {preventivo.fornitoreNome} · {formattaEuro(preventivo.prezzo)}</span>
      {preventivo.haFile && <button type="button" className="btn btn-ghost btn-piccolissimo" onClick={() => scaricaFile(preventivo.rispostaId, 'originale')}>Scarica file</button>}
      {!preventivo.haFileFirmato && (
        <label className="btn btn-ghost btn-piccolissimo" style={{ cursor: inCorso ? 'default' : 'pointer', opacity: inCorso ? .6 : 1 }}>
          {inCorso ? 'Invio…' : 'Carica firmato'}
          <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={inCorso} onChange={(e) => caricaFirmato(e.currentTarget)} />
        </label>
      )}
      {preventivo.haFileFirmato && (
        <button type="button" className="btn btn-ghost btn-piccolissimo" style={{ color: firmatoNonPartito ? undefined : 'var(--green)' }} onClick={() => scaricaFile(preventivo.rispostaId, 'firmato')}>
          {firmatoNonPartito ? 'Scarica firmato' : 'Firmato e inviato · scarica'}
        </button>
      )}
      {firmatoNonPartito && <button type="button" className="btn btn-ghost btn-piccolissimo" disabled={inCorso} onClick={reinviaFirmato}>{inCorso ? 'Invio…' : 'Reinvia firmato'}</button>}
      {firmatoNonPartito && <span style={{ color: 'var(--pink)', fontSize: 'var(--testo-xs)' }}>file firmato: email non partita</span>}
    </p>
  );
}
