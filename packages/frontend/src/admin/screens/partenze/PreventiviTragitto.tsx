import { useEffect, useState } from 'react';
import { preventiviApi, type CambioPercorso, type FornitoreCandidato, type RichiestaConRisposta } from '../../../api/preventivi';
import { eventiApi } from '../../../api/eventi';
import { fornitoriApi, type Fornitore } from '../../../api/fornitori';
import type { Tragitto } from '../../../api/types';
import { geocodifica } from '../../shared/geo';
import { notifica } from '../../shared/notifiche';
import { conferma } from '../../shared/conferma';
import { motivoErrore, ERRORE_MAPPE } from '../../shared/errori';
import { CampoNumero } from '../../shared/CampoNumero';
import { AvvisoCambioPercorso } from '../../shared/AvvisoCambioPercorso';
import { formattaEuro, plurale } from '../../../shared/formato';

/** Sezione "Preventivi" di UN tragitto (dentro Partenze): richiesta ai
 *  fornitori nel raggio, tabella delle risposte, accettazione, file
 *  firmato. Estratta da PartenzeTab (che teneva cinque Map "per
 *  tragitto" nello stato del genitore): qui lo stato è locale e
 *  semplice — un tragitto, un componente.
 *
 *  Ogni azione che scrive a un fornitore (richiesta, accettazione, file
 *  firmato) chiede conferma prima e dice dopo se l'email è partita
 *  davvero; quelle non partite si possono reinviare dall'elenco.
 *
 *  Se il percorso è cambiato dopo il preventivo accettato, in cima c'è il
 *  riquadro viola con cosa è cambiato e cosa fare: nuova richiesta "per
 *  cambio percorso" (anche ai fornitori già contattati) oppure conferma
 *  che il preventivo attuale va ancora bene. */
export function PreventiviTragitto({ tragittoId, tragittoVero, puoAccettare, onCambiato }: {
  tragittoId: string;
  tragittoVero: Tragitto | undefined;
  puoAccettare: boolean;
  /** Dopo ogni modifica al preventivo del tragitto: il genitore ricarica
   *  il tragitto (costo, fornitore, stato) e l'elenco delle card. */
  onCambiato: () => void;
}) {
  const [candidati, setCandidati] = useState<FornitoreCandidato[] | undefined>();
  const [risposte, setRisposte] = useState<RichiestaConRisposta[] | undefined>();
  const [erroreRisposte, setErroreRisposte] = useState('');
  const [manualiSelezionati, setManualiSelezionati] = useState<Set<string>>(new Set());
  const [caricandoCandidati, setCaricandoCandidati] = useState(false);
  const [inviandoRichiesta, setInviandoRichiesta] = useState(false);
  const [accettandoId, setAccettandoId] = useState<string | null>(null);
  const [caricandoFirmatoId, setCaricandoFirmatoId] = useState<string | null>(null);
  const [reinviandoId, setReinviandoId] = useState<string | null>(null);
  // Percorso cambiato dopo il preventivo accettato (null = in regola), e se
  // la richiesta aperta ora è una nuova richiesta per quel cambio.
  const [cambioPercorso, setCambioPercorso] = useState<CambioPercorso | null>(null);
  const [perCambioPercorso, setPerCambioPercorso] = useState(false);
  const [coordinateRichiesta, setCoordinateRichiesta] = useState<{ lat: number; lng: number } | null>(null);
  const [confermandoPercorso, setConfermandoPercorso] = useState(false);
  // Registrazione manuale del costo — per un preventivo avuto fuori dal
  // sistema (telefono, mail diretta) invece che tramite una richiesta.
  // Vive QUI (non più in Prezzi): questa è la sezione che stabilisce
  // costo e fornitore, Prezzi calcola solo i prezzi di vendita da un
  // costo già noto.
  const [apertoManuale, setApertoManuale] = useState(false);
  const [fornitoriLista, setFornitoriLista] = useState<Fornitore[]>([]);
  const [fornitoriNonDisponibili, setFornitoriNonDisponibili] = useState(false);
  const [formManuale, setFormManuale] = useState<{ costo?: number; postiBus?: number; fornitoreId?: string; file?: File }>({});
  const [salvandoManuale, setSalvandoManuale] = useState(false);
  useEffect(() => {
    fornitoriApi.list()
      .then((f) => setFornitoriLista(f.filter((x) => x.stato === 'APPROVATO')))
      .catch(() => setFornitoriNonDisponibili(true));
  }, []);

  function caricaRisposte() {
    preventiviApi.listaPerTragitto(tragittoId)
      .then((r) => { setRisposte(r); setErroreRisposte(''); })
      .catch((e) => setErroreRisposte(`Impossibile caricare le richieste inviate: ${motivoErrore(e)}`));
    preventiviApi.percorso(tragittoId).then(setCambioPercorso).catch(() => setCambioPercorso(null));
  }
  useEffect(() => { caricaRisposte(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tragittoId]);

  /** Il nome del fornitore del tragitto — "non disponibile" se l'elenco
   *  non si è caricato, invece di un falso "nessuno indicato". */
  function nomeFornitore(id: string | null | undefined) {
    if (!id) return 'nessuno indicato';
    return fornitoriLista.find((f) => f.id === id)?.nome ?? (fornitoriNonDisponibili ? 'nome non disponibile' : 'fornitore non più attivo');
  }

  function fileABase64(f: File): Promise<string> {
    return new Promise((risolvi, rifiuta) => {
      const lettore = new FileReader();
      lettore.onload = () => risolvi((lettore.result as string).split(',')[1]);
      lettore.onerror = () => rifiuta(new Error('Lettura file fallita'));
      lettore.readAsDataURL(f);
    });
  }

  async function salvaManuale() {
    if (!formManuale.costo || !formManuale.postiBus) { notifica('Inserisci il costo e i posti presunti del bus.', 'errore'); return; }
    // Registrarne uno nuovo sostituisce quello già salvato: va detto prima.
    if (tragittoVero?.preventivoCosto) {
      const ok = await conferma({
        titolo: 'Sostituire il preventivo registrato?',
        testo: <>Questo tragitto ha già un preventivo di <b>{formattaEuro(tragittoVero.preventivoCosto)}</b> ({nomeFornitore(tragittoVero.fornitoreId)}). Verrà sostituito da quello nuovo di <b>{formattaEuro(formManuale.costo)}</b>; poi ricontrolla i prezzi in Prezzi.</>,
        conferma: 'Sostituisci',
      });
      if (!ok) return;
    }
    setSalvandoManuale(true);
    try {
      const fileContenuto = formManuale.file ? await fileABase64(formManuale.file) : undefined;
      await eventiApi.registraPreventivoManuale(tragittoId, {
        preventivoCosto: formManuale.costo,
        preventivoPostiBus: formManuale.postiBus,
        fornitoreId: formManuale.fornitoreId,
        fileNome: formManuale.file?.name,
        fileContenuto,
      });
      notifica('Preventivo registrato: ora puoi calcolare i prezzi di vendita in Prezzi.', 'successo');
      setApertoManuale(false);
      setFormManuale({});
      caricaRisposte();
      onCambiato();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvandoManuale(false);
    }
  }

  /** perCambio: nuova richiesta perché il percorso è cambiato — la partenza
   *  può essere cambiata, quindi si cercano i fornitori vicini alla prima
   *  fermata attiva di adesso invece che alla partenza salvata. */
  async function caricaCandidati(perCambio: boolean) {
    if (!tragittoVero) return;
    setCaricandoCandidati(true);
    try {
      let lat = tragittoVero.partenzaLat, lng = tragittoVero.partenzaLng;
      if (perCambio || lat == null || lng == null) {
        const partenza = tragittoVero.fermate.filter((f) => f.attivo !== false)[0];
        if (!partenza?.citta) { notifica('Manca la città di partenza su questo tragitto: sistemala in Eventi prima di richiedere un preventivo.', 'errore'); return; }
        const r = await geocodifica(partenza.indirizzo ? `${partenza.indirizzo}, ${partenza.citta}` : partenza.citta);
        if (!r.coordinate) {
          notifica(r.erroreRete ? ERRORE_MAPPE : 'Indirizzo di partenza non trovato sulla mappa: controllalo in Eventi prima di richiedere un preventivo.', 'errore');
          return;
        }
        lat = r.coordinate.lat; lng = r.coordinate.lng;
      }
      setCoordinateRichiesta({ lat, lng });
      setPerCambioPercorso(perCambio);
      setCandidati(await preventiviApi.candidati(tragittoId, lat, lng));
    } catch (e) {
      notifica(`Ricerca dei fornitori vicini non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setCaricandoCandidati(false);
    }
  }

  function chiudiCandidati() {
    setCandidati(undefined);
    setManualiSelezionati(new Set());
    setPerCambioPercorso(false);
    setCoordinateRichiesta(null);
  }

  function toggleManuale(fornitoreId: string) {
    setManualiSelezionati((prev) => { const s = new Set(prev); if (s.has(fornitoreId)) s.delete(fornitoreId); else s.add(fornitoreId); return s; });
  }

  async function inviaRichiesta() {
    // Niente da inviare (nessun automatico nel raggio, nessuno scelto a
    // mano): prima partiva comunque un "Inviate 0 automatiche e 0 manuali".
    const destinatari = (candidati ?? []).filter((c) => c.statoCandidato === 'automatico' || manualiSelezionati.has(c.id));
    if (destinatari.length === 0) {
      notifica('Seleziona almeno un fornitore prima di inviare la richiesta.', 'errore');
      return;
    }
    const ok = await conferma({
      titolo: perCambioPercorso ? 'Inviare la richiesta di nuovo preventivo?' : 'Inviare la richiesta di preventivo?',
      testo: perCambioPercorso
        ? <>Riceveranno un'email che spiega che il percorso è cambiato, con il link per il nuovo preventivo: <b>{destinatari.map((c) => c.nome).join(', ')}</b>.</>
        : <>Riceveranno un'email con il link per rispondere: <b>{destinatari.map((c) => c.nome).join(', ')}</b>.</>,
      conferma: `Invia a ${plurale(destinatari.length, 'fornitore', 'fornitori')}`,
    });
    if (!ok) return;
    const eraPerCambio = perCambioPercorso;
    setInviandoRichiesta(true);
    try {
      const risultato = await preventiviApi.richiedi(tragittoId, {
        lat: coordinateRichiesta?.lat ?? tragittoVero?.partenzaLat ?? undefined,
        lng: coordinateRichiesta?.lng ?? tragittoVero?.partenzaLng ?? undefined,
        fornitoriManualiIds: [...manualiSelezionati],
        perCambioPercorso: eraPerCambio,
      });
      // Contate solo le email partite davvero: prima il messaggio diceva
      // "inviate" anche quando il servizio email non funzionava.
      const inviate = risultato.inviateAutomatiche + risultato.inviateManuali;
      const totale = inviate + risultato.nonInviate + risultato.senzaEmail;
      const cosa = eraPerCambio ? 'Richiesta di nuovo preventivo' : 'Richiesta';
      if (risultato.nonInviate === 0 && risultato.senzaEmail === 0) {
        notifica(`${cosa} inviata a ${plurale(inviate, 'fornitore', 'fornitori')}.`, 'successo');
      } else {
        const problemi = [
          risultato.nonInviate ? (risultato.nonInviate === 1 ? "1 email non è partita" : `${risultato.nonInviate} email non sono partite`) : '',
          risultato.senzaEmail ? `${plurale(risultato.senzaEmail, 'fornitore non ha', 'fornitori non hanno')} un indirizzo email` : '',
        ].filter(Boolean).join(' e ');
        notifica(`${cosa} registrata per ${plurale(totale, 'fornitore', 'fornitori')}, ma ${problemi}. Puoi reinviarla dall'elenco qui sotto.`, 'errore');
      }
      chiudiCandidati();
      caricaRisposte();
      if (eraPerCambio) onCambiato();
    } catch (e) {
      notifica(`Invio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInviandoRichiesta(false);
    }
  }

  /** "Il preventivo va ancora bene": il percorso di adesso diventa quello
   *  del preventivo accettato, senza cambiare costo né scrivere a nessuno. */
  async function confermaPercorsoAttuale() {
    if (!tragittoVero?.preventivoCosto) return;
    const ok = await conferma({
      titolo: 'Il preventivo va ancora bene?',
      testo: <>Il preventivo di <b>{formattaEuro(tragittoVero.preventivoCosto)}</b> ({nomeFornitore(tragittoVero.fornitoreId)}) resta valido anche per il percorso di adesso e l'avviso viola sparisce. Le richieste di nuovo preventivo ancora aperte si chiudono: i fornitori non potranno più rispondere.</>,
      conferma: 'Sì, va ancora bene',
    });
    if (!ok) return;
    setConfermandoPercorso(true);
    try {
      await preventiviApi.confermaPercorso(tragittoId);
      notifica('Preventivo confermato per il percorso di adesso.', 'successo');
      caricaRisposte();
      onCambiato();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setConfermandoPercorso(false);
    }
  }

  async function reinviaRichiesta(r: RichiestaConRisposta) {
    setReinviandoId(r.richiestaId);
    try {
      const { inviata } = await preventiviApi.reinviaRichiesta(r.richiestaId);
      notifica(inviata
        ? `Richiesta inviata di nuovo a ${r.fornitoreNome}.`
        : `L'email per ${r.fornitoreNome} non è partita neanche questa volta: controlla la configurazione delle email.`, inviata ? 'successo' : 'errore');
      caricaRisposte();
    } catch (e) {
      notifica(`Reinvio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setReinviandoId(null);
    }
  }

  async function accettaPreventivo(r: RichiestaConRisposta) {
    if (!r.risposta || accettandoId) return;
    const ok = await conferma({
      titolo: 'Accettare questo preventivo?',
      testo: <>Il preventivo di <b>{r.fornitore.nome}</b> ({formattaEuro(r.risposta.prezzo)}) diventa il costo di questo tragitto: servirà in Prezzi per calcolare i prezzi di vendita. Il fornitore riceverà un'email, e anche gli altri che hanno risposto.</>,
      conferma: 'Accetta preventivo',
    });
    if (!ok) return;
    setAccettandoId(r.risposta.id);
    try {
      const esito = await preventiviApi.accetta(r.risposta.id);
      const testo = [
        `Preventivo di ${r.fornitore.nome} accettato.`,
        esito.fornitoreAvvisato ? 'Il fornitore è stato avvisato via email.' : "L'email al fornitore non è partita.",
        esito.nonSceltiAvvisati ? `${plurale(esito.nonSceltiAvvisati, 'fornitore non scelto è stato avvisato', 'fornitori non scelti sono stati avvisati')}.` : '',
        'Ora calcola i prezzi di vendita in Prezzi.',
      ].filter(Boolean).join(' ');
      notifica(testo, esito.fornitoreAvvisato ? 'successo' : 'errore');
      caricaRisposte();
      onCambiato();
    } catch (e) {
      notifica(`Accettazione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setAccettandoId(null);
    }
  }

  async function caricaFileFirmatoPerRisposta(r: RichiestaConRisposta, input: HTMLInputElement) {
    const file = input.files?.[0];
    // Svuoto subito il campo: altrimenti, dopo un errore, scegliere di
    // nuovo lo stesso file non farebbe partire nulla.
    input.value = '';
    if (!file || !r.risposta) return;
    const ok = await conferma({
      titolo: 'Inviare il file firmato?',
      testo: <><b>{file.name}</b> verrà salvato e inviato subito via email a <b>{r.fornitore.nome}</b>.</>,
      conferma: 'Carica e invia',
    });
    if (!ok) return;
    setCaricandoFirmatoId(r.risposta.id);
    try {
      const { inviata } = await preventiviApi.caricaFileFirmato(r.risposta.id, file.name, await fileABase64(file));
      notifica(inviata
        ? `File firmato inviato a ${r.fornitore.nome}.`
        : `File firmato salvato, ma l'email per ${r.fornitore.nome} non è partita: usa "Reinvia firmato".`, inviata ? 'successo' : 'errore');
      caricaRisposte();
    } catch (e) {
      notifica(`Caricamento non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setCaricandoFirmatoId(null);
    }
  }

  async function reinviaFirmato(r: RichiestaConRisposta) {
    if (!r.risposta) return;
    setReinviandoId(r.risposta.id);
    try {
      const { inviata } = await preventiviApi.reinviaFileFirmato(r.risposta.id);
      notifica(inviata
        ? `File firmato inviato a ${r.fornitore.nome}.`
        : `L'email con il file firmato per ${r.fornitore.nome} non è partita: controlla la configurazione delle email.`, inviata ? 'successo' : 'errore');
      caricaRisposte();
    } catch (e) {
      notifica(`Reinvio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setReinviandoId(null);
    }
  }

  /** L'allegato non viaggia con la lista (peserebbe MB per riga): lo si
   *  chiede al server solo al clic. */
  async function scaricaFileRisposta(rispostaId: string, quale: 'originale' | 'firmato') {
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

  // Colore in scala dal più economico (verde) al più caro
  // (rosso) tra le risposte ricevute — solo tra quelle con
  // un prezzo vero, non ha senso scalare un valore solo.
  const prezzi = (risposte ?? []).filter((r) => r.risposta).map((r) => Number(r.risposta!.prezzo));
  const minPrezzo = Math.min(...prezzi), maxPrezzo = Math.max(...prezzi);
  function coloreScala(prezzo: number): string {
    if (prezzi.length < 2 || maxPrezzo === minPrezzo) return 'var(--mist)';
    const t = (prezzo - minPrezzo) / (maxPrezzo - minPrezzo); // 0 = più economico, 1 = più caro
    // Verde -> ambra -> rosso, interpolazione semplice sui
    // tre punti invece di un vero gradiente HSL — basta a
    // dare l'idea a colpo d'occhio, senza calcoli complessi.
    if (t < 0.5) return `color-mix(in srgb, var(--green) ${Math.round((1 - t * 2) * 100)}%, var(--amber) ${Math.round(t * 2 * 100)}%)`;
    return `color-mix(in srgb, var(--amber) ${Math.round((1 - (t - 0.5) * 2) * 100)}%, var(--pink) ${Math.round((t - 0.5) * 2 * 100)}%)`;
  }

  const pannelloAperto = apertoManuale || !!candidati;
  const stileNotaRossa = { display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--pink)' } as const;

  return (
    <div style={{ marginTop: 14 }}>
      {cambioPercorso && (
        <AvvisoCambioPercorso
          cambio={cambioPercorso}
          azioni={!pannelloAperto && (
            <>
              {cambioPercorso.stato !== 'da_valutare' && (
                <button type="button" className="btn btn-viola" disabled={caricandoCandidati} onClick={() => caricaCandidati(true)}>
                  {caricandoCandidati ? 'Cerco i fornitori vicini…' : cambioPercorso.stato === 'da_richiedere' ? 'Richiedi nuovo preventivo' : 'Chiedi ad altri fornitori'}
                </button>
              )}
              {puoAccettare && tragittoVero?.preventivoCosto && (
                <button type="button" className="btn btn-ghost" disabled={confermandoPercorso} onClick={confermaPercorsoAttuale}>
                  {confermandoPercorso ? 'Salvo…' : 'Il preventivo va ancora bene'}
                </button>
              )}
            </>
          )}
        />
      )}

      {/* Le due azioni sulla stessa riga, accanto al titolo: prima una era
          a destra e l'altra sotto a sinistra, come se non fossero sorelle. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <p className="section-label" style={{ marginBottom: 0 }}>Richiedi preventivo</p>
        {!pannelloAperto && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Con il percorso cambiato la richiesta giusta è quella viola
                qui sopra: una normale non potrebbe ricevere risposte. */}
            {!cambioPercorso && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-md)' }} disabled={caricandoCandidati} onClick={() => caricaCandidati(false)}>
                {caricandoCandidati ? 'Cerco i fornitori vicini…' : '+ Nuova richiesta preventivo'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-md)' }} onClick={() => setApertoManuale(true)}>+ Registra un preventivo avuto altrove</button>
          </div>
        )}
      </div>
      {apertoManuale && (
        <div style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <p className="testo-intro" style={{ marginBottom: 10 }}>Per un preventivo avuto fuori dal sistema (telefono, email diretta) invece che tramite una richiesta.</p>
          <div className="form-grid">
            <label>Costo del preventivo
              <CampoNumero valuta value={formManuale.costo} onChange={(v) => setFormManuale((f) => ({ ...f, costo: v }))} />
            </label>
            <label>Posti presunti del bus
              <CampoNumero value={formManuale.postiBus} onChange={(v) => setFormManuale((f) => ({ ...f, postiBus: v }))} />
            </label>
            <label>Fornitore (facoltativo)
              <select value={formManuale.fornitoreId ?? ''} onChange={(e) => setFormManuale((f) => ({ ...f, fornitoreId: e.target.value || undefined }))}>
                <option value="">— Nessuno indicato —</option>
                {fornitoriLista.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>
            <label>Allega il suo preventivo (facoltativo)
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFormManuale((f) => ({ ...f, file: e.target.files?.[0] }))} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary" disabled={salvandoManuale} onClick={salvaManuale}>{salvandoManuale ? 'Salvo…' : 'Registra preventivo'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setApertoManuale(false); setFormManuale({}); }}>Annulla</button>
          </div>
        </div>
      )}
      {candidati && (
        <div style={{ background: 'var(--night)', border: `1px solid ${perCambioPercorso ? 'var(--viola)' : 'var(--line)'}`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
          {perCambioPercorso && (
            <p style={{ fontSize: 'var(--testo-md)', color: 'var(--viola)', fontWeight: 600, marginBottom: 8 }}>
              Nuova richiesta per cambio percorso: i fornitori ricevono un'email che spiega che il percorso è cambiato. Puoi scegliere anche chi avevi già contattato.
            </p>
          )}
          {candidati.length === 0 && <p className="testo-intro">Nessun fornitore approvato entro il raggio impostato: allarga il raggio in Impostazioni o registra un fornitore più vicino.</p>}
          {candidati.filter((c) => c.statoCandidato === 'automatico').length > 0 && (
            <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginBottom: 8 }}>
              Invio automatico a: {candidati.filter((c) => c.statoCandidato === 'automatico').map((c) => c.nome).join(', ')}
            </p>
          )}
          {candidati.filter((c) => c.statoCandidato !== 'automatico').map((c) => {
            const oscurato = c.statoCandidato === 'gia_contattato' && !perCambioPercorso;
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: oscurato ? .45 : 1, cursor: oscurato ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  disabled={oscurato}
                  checked={manualiSelezionati.has(c.id)}
                  onChange={() => toggleManuale(c.id)}
                  style={{ width: 'auto' }}
                />
                <span style={{ flex: 1 }}>{c.nome} <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>({c.distanzaKm} km)</span></span>
                {c.statoCandidato === 'gia_contattato' && <span style={{ fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>{perCambioPercorso ? 'contattato per il percorso di prima' : 'già contattato'}</span>}
                {c.statoCandidato === 'accettato_in_precedenza' && <span style={{ fontSize: 'var(--testo-xs)', color: 'var(--green)' }}>scelto in precedenza per questo tragitto</span>}
              </label>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className={`btn ${perCambioPercorso ? 'btn-viola' : 'btn-primary'}`} disabled={inviandoRichiesta || candidati.length === 0} onClick={inviaRichiesta}>
              {inviandoRichiesta ? 'Invio…' : perCambioPercorso ? 'Invia richiesta di nuovo preventivo' : 'Invia richiesta'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={chiudiCandidati}>Annulla</button>
          </div>
        </div>
      )}

      {/* Il preventivo registrato (a mano o accettato) si vede anche qui,
          subito dopo il salvataggio. */}
      {tragittoVero?.preventivoCosto && (
        <div className="section-card" style={{ marginTop: 14, background: 'var(--dusk-2)' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Preventivo registrato: {formattaEuro(tragittoVero.preventivoCosto)} · {tragittoVero.preventivoPostiBus != null ? plurale(tragittoVero.preventivoPostiBus, 'posto presunto', 'posti presunti') : 'posti non indicati'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--testo-md)', color: 'var(--mist)' }}>
            Fornitore: {nomeFornitore(tragittoVero.fornitoreId)}.{' '}
            {cambioPercorso
              ? <span style={{ color: 'var(--viola)', fontWeight: 600 }}>Fatto sul percorso di prima.</span>
              : 'Prossimo passo: calcolare i prezzi di vendita in Prezzi.'}
          </p>
        </div>
      )}
      <p className="section-label" style={{ marginTop: 18, marginBottom: 8 }}>Richieste e risposte</p>
      {erroreRisposte ? (
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>{erroreRisposte}</p>
      ) : !risposte ? (
        <p className="testo-intro">Carico…</p>
      ) : risposte.length === 0 ? (
        <p className="testo-intro">Nessuna richiesta inviata ancora per questo tragitto.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Fornitore</th><th style={{ textAlign: 'right' }}>Costo</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {risposte.map((r) => {
                // Accettata = la risposta con fornitore e prezzo del preventivo.
                // Non lo è una richiesta senza risposta, né la risposta a una
                // richiesta per cambio percorso ancora aperta (anche se arriva
                // dallo stesso fornitore).
                const accettato = !!r.risposta
                  && tragittoVero?.fornitoreId === r.fornitore.id
                  && r.cambioPercorso !== 'aperta'
                  && (tragittoVero.preventivoCosto == null || Number(tragittoVero.preventivoCosto) === Number(r.risposta.prezzo));
                const firmatoNonPartito = !!r.risposta?.haFileFirmato && !r.risposta.fileFirmatoInviatoIl;
                return (
                  <tr key={r.richiestaId}>
                    <td>
                      {r.fornitoreNome}
                      {r.cambioPercorso && (
                        <span className={`badge ${r.cambioPercorso === 'aperta' ? 'percorso-cambiato' : 'neutro'}`} style={{ marginLeft: 6 }}>
                          {r.cambioPercorso === 'aperta' ? 'Cambio percorso' : 'Cambio percorso, chiusa'}
                        </span>
                      )}
                    </td>
                    {/* Non solo colore (per chi non lo distingue): il più
                        economico e il più caro hanno anche il testo. */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700, color: r.risposta ? coloreScala(Number(r.risposta.prezzo)) : 'var(--mist)' }}>
                        {r.risposta ? formattaEuro(r.risposta.prezzo) : '—'}
                      </span>
                      {r.risposta && prezzi.length >= 2 && Number(r.risposta.prezzo) === minPrezzo && <span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>più economico</span>}
                      {r.risposta && prezzi.length >= 2 && Number(r.risposta.prezzo) === maxPrezzo && maxPrezzo !== minPrezzo && <span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--mist)' }}>più caro</span>}
                    </td>
                    <td style={{ fontSize: 'var(--testo-sm)' }}>
                      {accettato ? (
                        <span className="badge badge-stato-verde">Accettato</span>
                      ) : r.risposta ? (
                        <span style={{ color: 'var(--mist)' }}>Ha risposto</span>
                      ) : (
                        <span style={{ color: 'var(--mist)' }}>
                          In attesa di risposta
                          {r.linkScaduto && <span style={stileNotaRossa}>link scaduto</span>}
                          {!r.fornitore.email && <span style={stileNotaRossa}>fornitore senza email</span>}
                        </span>
                      )}
                      {firmatoNonPartito && <span style={stileNotaRossa}>file firmato: email non partita</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {/* Reinvio: per chi non ha ancora risposto (anche col link
                          scaduto, che torna valido) finché il viaggio non è
                          assegnato, o se è una richiesta per cambio percorso aperta. */}
                      {!r.risposta && r.fornitore.email && (!tragittoVero?.fornitoreId || r.cambioPercorso === 'aperta') && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" disabled={!!reinviandoId} onClick={() => reinviaRichiesta(r)}>
                          {reinviandoId === r.richiestaId ? 'Invio…' : 'Reinvia'}
                        </button>
                      )}
                      {r.risposta?.haFile && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" onClick={() => scaricaFileRisposta(r.risposta!.id, 'originale')}>Scarica file</button>
                      )}
                      {r.risposta && puoAccettare && !accettato && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" style={{ color: 'var(--green)', marginLeft: 6 }} disabled={!!accettandoId} onClick={() => accettaPreventivo(r)}>
                          {accettandoId === r.risposta.id ? 'Accetto…' : 'Accetta'}
                        </button>
                      )}
                      {r.risposta && accettato && !r.risposta.haFileFirmato && (
                        <label className="btn btn-ghost btn-piccolissimo" style={{ cursor: caricandoFirmatoId ? 'default' : 'pointer', marginLeft: 6, opacity: caricandoFirmatoId ? .6 : 1 }}>
                          {caricandoFirmatoId === r.risposta.id ? 'Invio…' : 'Carica firmato'}
                          <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={!!caricandoFirmatoId} onChange={(e) => caricaFileFirmatoPerRisposta(r, e.currentTarget)} />
                        </label>
                      )}
                      {r.risposta?.haFileFirmato && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" style={{ color: firmatoNonPartito ? undefined : 'var(--green)', marginLeft: 6 }} onClick={() => scaricaFileRisposta(r.risposta!.id, 'firmato')}>
                          {firmatoNonPartito ? 'Scarica firmato' : 'Firmato e inviato · scarica'}
                        </button>
                      )}
                      {firmatoNonPartito && (
                        <button type="button" className="btn btn-ghost btn-piccolissimo" style={{ marginLeft: 6 }} disabled={!!reinviandoId} onClick={() => reinviaFirmato(r)}>
                          {reinviandoId === r.risposta!.id ? 'Invio…' : 'Reinvia firmato'}
                        </button>
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
