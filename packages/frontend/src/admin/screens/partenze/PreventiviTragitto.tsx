import { useEffect, useState } from 'react';
import { preventiviApi, type FornitoreCandidato, type RichiestaConRisposta } from '../../../api/preventivi';
import type { Tragitto } from '../../../api/types';
import { ErroreApi } from '../../../api/client';
import { geocodifica } from '../../shared/geo';
import { notifica } from '../../shared/notifiche';

/** Sezione "Preventivi" di UN tragitto (dentro Partenze): richiesta ai
 *  fornitori nel raggio, tabella delle risposte, accettazione, file
 *  firmato. Estratta da PartenzeTab (che teneva cinque Map "per
 *  tragitto" nello stato del genitore): qui lo stato è locale e
 *  semplice — un tragitto, un componente. */
export function PreventiviTragitto({ tragittoId, tragittoVero, puoAccettare, onAccettato }: {
  tragittoId: string;
  tragittoVero: Tragitto | undefined;
  puoAccettare: boolean;
  onAccettato: () => void;
}) {
  const [candidati, setCandidati] = useState<FornitoreCandidato[] | undefined>();
  const [risposte, setRisposte] = useState<RichiestaConRisposta[] | undefined>();
  const [manualiSelezionati, setManualiSelezionati] = useState<Set<string>>(new Set());
  const [caricandoCandidati, setCaricandoCandidati] = useState(false);
  const [inviandoRichiesta, setInviandoRichiesta] = useState(false);

  function caricaRisposte() {
    preventiviApi.listaPerTragitto(tragittoId).then(setRisposte).catch(() => {});
  }
  useEffect(() => { caricaRisposte(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tragittoId]);

  async function caricaCandidati() {
    if (!tragittoVero) return;
    setCaricandoCandidati(true);
    try {
      let lat = tragittoVero.partenzaLat, lng = tragittoVero.partenzaLng;
      if (lat == null || lng == null) {
        const partenza = tragittoVero.fermate[0];
        if (!partenza?.citta) { notifica('Manca la città di partenza su questo tragitto — sistemala in Eventi prima di richiedere un preventivo.'); return; }
        const r = await geocodifica(partenza.indirizzo ? `${partenza.indirizzo}, ${partenza.citta}` : partenza.citta);
        if (!r.coordinate) { notifica('Indirizzo di partenza non trovato — controllalo in Eventi prima di richiedere un preventivo.'); return; }
        lat = r.coordinate.lat; lng = r.coordinate.lng;
      }
      setCandidati(await preventiviApi.candidati(tragittoId, lat, lng));
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Impossibile caricare i fornitori vicini.');
    } finally {
      setCaricandoCandidati(false);
    }
  }

  function toggleManuale(fornitoreId: string) {
    setManualiSelezionati((prev) => { const s = new Set(prev); if (s.has(fornitoreId)) s.delete(fornitoreId); else s.add(fornitoreId); return s; });
  }

  async function inviaRichiesta() {
    setInviandoRichiesta(true);
    try {
      const risultato = await preventiviApi.richiedi(tragittoId, {
        lat: tragittoVero?.partenzaLat ?? undefined,
        lng: tragittoVero?.partenzaLng ?? undefined,
        fornitoriManualiIds: [...manualiSelezionati],
      });
      notifica(`Inviate ${risultato.inviateAutomatiche} richiesta/e automatica/e e ${risultato.inviateManuali} manuale/i.`, 'successo');
      setCandidati(undefined);
      setManualiSelezionati(new Set());
      caricaRisposte();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Invio non riuscito.');
    } finally {
      setInviandoRichiesta(false);
    }
  }

  async function accettaPreventivo(rispostaId: string) {
    if (!confirm('Accettare questo preventivo? Il prezzo verrà scritto nel campo Prezzi (sezione Prezzi), da lì si calcola e valida il prezzo di vendita.')) return;
    try {
      await preventiviApi.accetta(rispostaId);
      notifica('Preventivo accettato — il prezzo è ora nel campo costo di Prezzi.', 'successo');
      caricaRisposte();
      onAccettato();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Accettazione non riuscita.');
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

  async function caricaFileFirmatoPerRisposta(rispostaId: string, file: File) {
    try {
      await preventiviApi.caricaFileFirmato(rispostaId, file.name, await fileABase64(file));
      notifica('File firmato caricato e inviato al fornitore.', 'successo');
      caricaRisposte();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Caricamento non riuscito.');
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
      notifica(e instanceof ErroreApi ? e.message : 'Download non riuscito.');
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

  return (
    <div style={{ marginTop: 14 }}>
      <p className="section-label" style={{ marginBottom: 8 }}>Richiedi preventivo</p>
      {!candidati ? (
        <button type="button" className="btn btn-ghost" disabled={caricandoCandidati} onClick={caricaCandidati}>
          {caricandoCandidati ? 'Cerco i fornitori vicini...' : '+ Nuova richiesta preventivo'}
        </button>
      ) : (
        <div style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          {candidati.length === 0 && <p className="testo-intro">Nessun fornitore approvato entro il raggio impostato — allarga il raggio in Impostazioni o registra un fornitore più vicino.</p>}
          {candidati.filter((c) => c.statoCandidato === 'automatico').length > 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 8 }}>
              Invio automatico a: {candidati.filter((c) => c.statoCandidato === 'automatico').map((c) => c.nome).join(', ')}
            </p>
          )}
          {candidati.filter((c) => c.statoCandidato !== 'automatico').map((c) => {
            const oscurato = c.statoCandidato === 'gia_contattato';
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: oscurato ? .45 : 1, cursor: oscurato ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  disabled={oscurato}
                  checked={manualiSelezionati.has(c.id)}
                  onChange={() => toggleManuale(c.id)}
                  style={{ width: 'auto' }}
                />
                <span style={{ flex: 1 }}>{c.nome} <span style={{ color: 'var(--mist)', fontSize: 12 }}>({c.distanzaKm} km)</span></span>
                {oscurato && <span style={{ fontSize: 11, color: 'var(--mist)' }}>già contattato, non scelto</span>}
                {c.statoCandidato === 'accettato_in_precedenza' && <span style={{ fontSize: 11, color: 'var(--green)' }}>fornitore di fiducia per questo tragitto</span>}
              </label>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary" disabled={inviandoRichiesta} onClick={inviaRichiesta}>{inviandoRichiesta ? 'Invio...' : 'Invia richiesta'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setCandidati(undefined); setManualiSelezionati(new Set()); }}>Annulla</button>
          </div>
        </div>
      )}

      <p className="section-label" style={{ marginTop: 18, marginBottom: 8 }}>Risposte ricevute</p>
      {!risposte || risposte.length === 0 ? (
        <p className="testo-intro">Nessuna richiesta inviata ancora per questo tragitto.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Fornitore</th><th>Prezzo</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {risposte.map((r) => (
                <tr key={r.richiesta.id}>
                  <td>{r.fornitore.nome}</td>
                  {/* Non solo colore (per chi non lo distingue): il più
                      economico e il più caro hanno anche icona e testo. */}
                  <td style={{ fontWeight: 700, color: r.risposta ? coloreScala(Number(r.risposta.prezzo)) : 'var(--mist)' }}
                    title={r.risposta && prezzi.length >= 2 ? (Number(r.risposta.prezzo) === minPrezzo ? 'Il più economico tra le risposte ricevute' : Number(r.risposta.prezzo) === maxPrezzo ? 'Il più caro tra le risposte ricevute' : undefined) : undefined}>
                    {r.risposta ? `€${Number(r.risposta.prezzo).toFixed(2)}` : '— in attesa'}
                    {r.risposta && prezzi.length >= 2 && Number(r.risposta.prezzo) === minPrezzo && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6 }}>▼ più economico</span>}
                    {r.risposta && prezzi.length >= 2 && Number(r.risposta.prezzo) === maxPrezzo && maxPrezzo !== minPrezzo && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6 }}>▲ più caro</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--mist)' }}>
                    {tragittoVero?.fornitoreId === r.fornitore.id ? '✓ Accettato' : r.risposta ? 'Risposto' : 'In attesa'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.risposta?.haFile && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => scaricaFileRisposta(r.risposta!.id, 'originale')}>Scarica file</button>
                    )}
                    {r.risposta && puoAccettare && tragittoVero?.fornitoreId !== r.fornitore.id && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--green)' }} onClick={() => accettaPreventivo(r.risposta!.id)}>Accetta</button>
                    )}
                    {r.risposta && tragittoVero?.fornitoreId === r.fornitore.id && !r.risposta.haFileFirmato && (
                      <label className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>
                        Carica firmato
                        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaFileFirmatoPerRisposta(r.risposta!.id, f); }} />
                      </label>
                    )}
                    {r.risposta?.haFileFirmato && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--green)' }} onClick={() => scaricaFileRisposta(r.risposta!.id, 'firmato')}>✓ Firmato e inviato — scarica</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
