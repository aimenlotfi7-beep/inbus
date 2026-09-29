import { useEffect, useState } from 'react';
import {
  pagamentiFornitoriApi,
  type ElencoPagamentiFornitori, type FiltriSpese, type MetodoPagamento,
  type PagamentoSpesa, type SpesaFornitore, type SpesaInput,
} from '../../api/pagamentiFornitori';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { caricaFile } from '../../api/upload';
import { PanelHead } from '../shared/PanelHead';
import { Modale } from '../shared/Modale';
import { notifica } from '../shared/notifiche';
import { conferma } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { formattaData, formattaEuro } from '../../shared/formato';

/** Pagamenti fornitori (proprietario, settembre 2026): in un posto solo
 *  quanto si deve, a chi, con quale fattura e entro quando. Le spese dei
 *  bus confermati compaiono da sole (stesso costo che le Statistiche
 *  tolgono dal margine); le altre â€” pedaggi, extra, anticipi â€” si
 *  aggiungono a mano. Un pagamento non cancella la spesa: la spesa resta
 *  e sotto ci sono i versamenti, cosÃ¬ acconto e saldo si vedono tutti. */
export function PagamentiFornitoriScreen() {
  const [dati, setDati] = useState<ElencoPagamentiFornitori | null>(null);
  const [errore, setErrore] = useState('');
  const [filtri, setFiltri] = useState<FiltriSpese>({});
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<SpesaFornitore | 'nuova' | null>(null);
  const [inPagamento, setInPagamento] = useState<SpesaFornitore | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  function ricarica(f: FiltriSpese = filtri) {
    pagamentiFornitoriApi.elenco(f)
      .then((d) => { setDati(d); setErrore(''); })
      .catch((e) => setErrore(`Pagamenti non caricati: ${motivoErrore(e)}`));
  }
  useEffect(() => { ricarica(filtri); }, [filtri]);
  useEffect(() => {
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    eventiApi.list().then(setEventi).catch(() => setEventi([]));
  }, []);

  function cambiaFiltro(campo: keyof FiltriSpese, valore: string) {
    setFiltri((f) => ({ ...f, [campo]: valore || undefined }));
  }

  async function cambiaAnnullata(s: SpesaFornitore) {
    const ok = await conferma({
      titolo: s.annullata ? 'Rimettere la spesa tra quelle da pagare?' : 'Annullare la spesa?',
      testo: s.annullata
        ? <>La spesa di <b>{s.fornitoreNome}</b> torna nei totali da pagare.</>
        : <>La spesa di <b>{s.fornitoreNome}</b> ({formattaEuro(s.importo)}) esce dai totali ma resta nello storico.</>,
      conferma: s.annullata ? 'Rimetti' : 'Annulla la spesa',
    });
    if (!ok) return;
    await azione(s.id, () => pagamentiFornitoriApi.aggiorna(s.id, { annullata: !s.annullata }),
      s.annullata ? 'Spesa di nuovo da pagare.' : 'Spesa annullata.');
  }

  async function elimina(s: SpesaFornitore) {
    const ok = await conferma({
      titolo: 'Eliminare la spesa?',
      testo: <><b>{s.descrizione}</b> verrÃ  eliminata definitivamente.</>,
      conferma: 'Elimina',
    });
    if (!ok) return;
    await azione(s.id, () => pagamentiFornitoriApi.elimina(s.id), 'Spesa eliminata.');
  }

  async function azione(id: string, lavoro: () => Promise<unknown>, messaggio: string) {
    setInCorso(id);
    try {
      await lavoro();
      notifica(messaggio, 'successo');
      ricarica();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorso(null);
    }
  }

  const r = dati?.riepilogo;

  return (
    <div>
      <PanelHead
        titolo="Pagamenti fornitori"
        azione={<button type="button" className="btn btn-primary" onClick={() => setInModifica('nuova')}>+ Nuova spesa</button>}
      />
      <p className="testo-intro">
        Quanto si deve ai fornitori, con i dati della fattura e le scadenze. I bus confermati che hanno fornitore e costo
        compaiono da soli; finchÃ© non registri un pagamento o il numero della fattura seguono il costo scritto in Partenze.
        Un acconto e un saldo sono due pagamenti della stessa spesa.
      </p>

      {errore && <p className="avviso avviso-errore" role="alert">{errore} <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => ricarica()}>Riprova</button></p>}

      {r && (
        <div className="riepilogo-numeri">
          <div className="riepilogo-numero"><span>Da pagare</span><b>{formattaEuro(r.daPagare)}</b><small>{r.numero} {r.numero === 1 ? 'spesa' : 'spese'}</small></div>
          <div className="riepilogo-numero"><span>Scaduto</span><b>{formattaEuro(r.scaduto)}</b><small>oltre la data della fattura</small></div>
          <div className="riepilogo-numero"><span>In scadenza</span><b>{formattaEuro(r.inScadenza)}</b><small>entro 7 giorni</small></div>
          <div className="riepilogo-numero"><span>GiÃ  pagato</span><b>{formattaEuro(r.pagato)}</b><small>su {formattaEuro(r.totale)} totali</small></div>
          <div className="riepilogo-numero"><span>Senza fattura</span><b>{r.senzaFattura}</b><small>numero fattura non ancora inserito</small></div>
        </div>
      )}

      <div className="filtri-riga">
        <label>
          <span>Stato</span>
          <select value={filtri.stato ?? ''} onChange={(e) => cambiaFiltro('stato', e.target.value)}>
            <option value="">Tutti</option>
            <option value="DA_PAGARE">Da pagare</option>
            <option value="PARZIALE">Pagate in parte</option>
            <option value="PAGATA">Pagate</option>
            <option value="SCADUTE">In ritardo</option>
            <option value="ANNULLATA">Annullate</option>
          </select>
        </label>
        <label>
          <span>Fornitore</span>
          <select value={filtri.fornitoreId ?? ''} onChange={(e) => cambiaFiltro('fornitoreId', e.target.value)}>
            <option value="">Tutti</option>
            {(dati?.filtri.fornitori ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label>
          <span>Evento</span>
          <select value={filtri.eventoId ?? ''} onChange={(e) => cambiaFiltro('eventoId', e.target.value)}>
            <option value="">Tutti</option>
            {(dati?.filtri.eventi ?? []).map((e) => <option key={e.id} value={e.id}>{e.artista} Â· {formattaData(e.data)}</option>)}
          </select>
        </label>
        <label>
          <span>Dal</span>
          <input type="date" value={filtri.dal ?? ''} onChange={(e) => cambiaFiltro('dal', e.target.value)} />
        </label>
        <label>
          <span>Al</span>
          <input type="date" value={filtri.al ?? ''} onChange={(e) => cambiaFiltro('al', e.target.value)} />
        </label>
        <label className="filtro-largo">
          <span>Cerca</span>
          <input type="search" placeholder="Fornitore, descrizione o numero fattura" value={filtri.testo ?? ''} onChange={(e) => cambiaFiltro('testo', e.target.value)} />
        </label>
        <button type="button" className="btn btn-ghost" onClick={() => setFiltri({})} disabled={Object.keys(filtri).length === 0}>Azzera filtri</button>
      </div>

      {!errore && dati === null && <p className="testo-intro">Caricoâ€¦</p>}
      {dati && dati.spese.length === 0 && <p className="testo-intro">Nessuna spesa con questi filtri.</p>}

      {dati && dati.spese.length > 0 && (
        <div className="table-scroll adattiva">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fornitore</th>
                <th>Spesa</th>
                <th>Fattura</th>
                <th>Scadenza</th>
                <th style={{ textAlign: 'right' }}>Importo</th>
                <th style={{ textAlign: 'right' }}>Pagato</th>
                <th style={{ textAlign: 'right' }}>Resta</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dati.spese.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.fornitoreNome}</b></td>
                  <td>
                    {s.descrizione}
                    {s.eventoArtista && <><br /><span className="testo-secondario">{s.eventoArtista}{s.eventoData ? ` Â· ${formattaData(s.eventoData)}` : ''}</span></>}
                  </td>
                  <td>
                    {s.numeroFattura ?? <span className="testo-secondario">â€”</span>}
                    {s.dataFattura && <><br /><span className="testo-secondario">{formattaData(s.dataFattura)}</span></>}
                    {s.fatturaUrl && <><br /><a href={s.fatturaUrl} target="_blank" rel="noreferrer">Apri il file</a></>}
                  </td>
                  <td>{s.scadenza ? formattaData(s.scadenza) : <span className="testo-secondario">â€”</span>}</td>
                  <td style={{ textAlign: 'right' }}>{formattaEuro(s.importo)}</td>
                  <td style={{ textAlign: 'right' }}>{formattaEuro(s.pagato)}{s.numeroPagamenti > 1 && <><br /><span className="testo-secondario">{s.numeroPagamenti} pagamenti</span></>}</td>
                  <td style={{ textAlign: 'right' }}><b>{formattaEuro(s.residuo)}</b></td>
                  <td><StatoSpesaBadge spesa={s} /></td>
                  <td className="azioni-riga">
                    <button type="button" className="btn btn-ghost btn-piccolo" disabled={inCorso === s.id || s.annullata || s.residuo <= 0} onClick={() => setInPagamento(s)}>Paga</button>
                    <button type="button" className="btn btn-ghost btn-piccolo" disabled={inCorso === s.id} onClick={() => setInModifica(s)}>Modifica</button>
                    <button type="button" className="btn btn-ghost btn-piccolo" disabled={inCorso === s.id} onClick={() => cambiaAnnullata(s)}>{s.annullata ? 'Rimetti' : 'Annulla'}</button>
                    {s.origine === 'MANUALE' && s.numeroPagamenti === 0 && (
                      <button type="button" className="btn btn-ghost btn-piccolo" disabled={inCorso === s.id} onClick={() => elimina(s)}>Elimina</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dati && dati.perFornitore.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <PanelHead titolo="Quanto si deve a ogni fornitore" />
          <div className="table-scroll adattiva">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fornitore</th>
                  <th style={{ textAlign: 'right' }}>Totale</th>
                  <th style={{ textAlign: 'right' }}>Pagato</th>
                  <th style={{ textAlign: 'right' }}>Da pagare</th>
                </tr>
              </thead>
              <tbody>
                {dati.perFornitore.map((f) => (
                  <tr key={f.fornitoreId}>
                    <td>{f.fornitoreNome}</td>
                    <td style={{ textAlign: 'right' }}>{formattaEuro(f.totale)}</td>
                    <td style={{ textAlign: 'right' }}>{formattaEuro(f.pagato)}</td>
                    <td style={{ textAlign: 'right' }}><b>{formattaEuro(f.daPagare)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inModifica && (
        <ModaleSpesa
          spesa={inModifica === 'nuova' ? null : inModifica}
          fornitori={fornitori}
          eventi={eventi}
          onClose={() => setInModifica(null)}
          onSalvata={() => { setInModifica(null); ricarica(); }}
        />
      )}

      {inPagamento && (
        <ModalePagamenti
          spesa={inPagamento}
          onClose={() => setInPagamento(null)}
          onCambiato={() => ricarica()}
        />
      )}
    </div>
  );
}

function StatoSpesaBadge({ spesa }: { spesa: SpesaFornitore }) {
  if (spesa.annullata) return <span className="badge">Annullata</span>;
  if (spesa.stato === 'PAGATA') return <span className="badge coperta">Pagata</span>;
  if (spesa.scaduta) return <span className="badge non-coperta">In ritardo</span>;
  if (spesa.inScadenza) return <span className="badge attenzione">In scadenza</span>;
  if (spesa.stato === 'PARZIALE') return <span className="badge attenzione">Pagata in parte</span>;
  return <span className="badge">Da pagare</span>;
}

/** Nuova spesa o modifica: gli stessi campi in tutti e due i casi. */
function ModaleSpesa({
  spesa, fornitori, eventi, onClose, onSalvata,
}: {
  spesa: SpesaFornitore | null;
  fornitori: Fornitore[];
  eventi: Evento[];
  onClose: () => void;
  onSalvata: () => void;
}) {
  const [campi, setCampi] = useState({
    fornitoreId: spesa?.fornitoreId ?? '',
    eventoId: spesa?.eventoId ?? '',
    descrizione: spesa?.descrizione ?? '',
    importo: spesa ? String(spesa.importo).replace('.', ',') : '',
    numeroFattura: spesa?.numeroFattura ?? '',
    dataFattura: soloData(spesa?.dataFattura),
    scadenza: soloData(spesa?.scadenza),
    fatturaUrl: spesa?.fatturaUrl ?? '',
    note: spesa?.note ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const [caricando, setCaricando] = useState(false);

  function cambia(campo: keyof typeof campi, valore: string) {
    setCampi((c) => ({ ...c, [campo]: valore }));
  }

  async function caricaFattura(file: File | null) {
    if (!file) return;
    setCaricando(true);
    try {
      cambia('fatturaUrl', await caricaFile(file));
      notifica('File caricato.', 'successo');
    } catch (e) {
      notifica(`Caricamento non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setCaricando(false);
    }
  }

  async function salva() {
    const importo = Number(campi.importo.replace(/\./g, '').replace(',', '.'));
    if (!spesa && !campi.fornitoreId) { notifica('Scegli il fornitore.', 'errore'); return; }
    if (!campi.descrizione.trim()) { notifica('Scrivi a cosa si riferisce la spesa.', 'errore'); return; }
    if (!Number.isFinite(importo) || importo <= 0) { notifica("L'importo deve essere un numero maggiore di zero.", 'errore'); return; }

    const input: SpesaInput = {
      eventoId: campi.eventoId || null,
      descrizione: campi.descrizione.trim(),
      importo,
      numeroFattura: campi.numeroFattura.trim() || null,
      dataFattura: campi.dataFattura || null,
      scadenza: campi.scadenza || null,
      fatturaUrl: campi.fatturaUrl || null,
      note: campi.note.trim() || null,
    };
    setSalvando(true);
    try {
      if (spesa) await pagamentiFornitoriApi.aggiorna(spesa.id, input);
      else await pagamentiFornitoriApi.crea({ ...input, fornitoreId: campi.fornitoreId });
      notifica(spesa ? 'Spesa aggiornata.' : 'Spesa aggiunta.', 'successo');
      onSalvata();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modale titolo={spesa ? 'Modifica la spesa' : 'Nuova spesa'} onClose={onClose} larga>
      <div className="form-grid">
        <label>
          <span>Fornitore</span>
          {spesa
            ? <input type="text" value={spesa.fornitoreNome} readOnly />
            : (
              <select value={campi.fornitoreId} onChange={(e) => cambia('fornitoreId', e.target.value)}>
                <option value="">Scegliâ€¦</option>
                {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            )}
        </label>
        <label>
          <span>Evento (facoltativo)</span>
          <select value={campi.eventoId} onChange={(e) => cambia('eventoId', e.target.value)}>
            <option value="">Nessuno</option>
            {eventi.map((e) => <option key={e.id} value={e.id}>{e.artista} Â· {formattaData(e.data)}</option>)}
          </select>
        </label>
        <label className="full">
          <span>Descrizione</span>
          <input type="text" value={campi.descrizione} onChange={(e) => cambia('descrizione', e.target.value)} placeholder="Es. Bus Roma â€” pedaggi e parcheggio" />
        </label>
        <label>
          <span>Importo (â‚¬)</span>
          <input type="text" inputMode="decimal" value={campi.importo} onChange={(e) => cambia('importo', e.target.value)} placeholder="1200,00" />
        </label>
        <label>
          <span>Numero fattura</span>
          <input type="text" value={campi.numeroFattura} onChange={(e) => cambia('numeroFattura', e.target.value)} />
        </label>
        <label>
          <span>Data fattura</span>
          <input type="date" value={campi.dataFattura} onChange={(e) => cambia('dataFattura', e.target.value)} />
        </label>
        <label>
          <span>Scadenza</span>
          <input type="date" value={campi.scadenza} onChange={(e) => cambia('scadenza', e.target.value)} />
        </label>
        <label className="full">
          <span>File della fattura (PDF o immagine)</span>
          <input type="file" accept="application/pdf,image/*" onChange={(e) => caricaFattura(e.target.files?.[0] ?? null)} disabled={caricando} />
          {campi.fatturaUrl && (
            <span className="testo-secondario">
              <a href={campi.fatturaUrl} target="_blank" rel="noreferrer">File caricato</a>{' '}
              <button type="button" className="btn btn-ghost btn-piccolissimo" onClick={() => cambia('fatturaUrl', '')}>Togli</button>
            </span>
          )}
        </label>
        <label className="full">
          <span>Note</span>
          <textarea rows={2} value={campi.note} onChange={(e) => cambia('note', e.target.value)} />
        </label>
      </div>
      {spesa?.origine === 'BUS' && (
        <p className="testo-secondario" style={{ marginTop: 12 }}>
          Questa spesa arriva da un bus confermato: appena inserisci il numero della fattura o registri un pagamento
          smette di seguire il costo scritto in Partenze.
        </p>
      )}
      <div className="modal-azioni">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button type="button" className="btn btn-primary" onClick={salva} disabled={salvando || caricando}>{salvando ? 'Salvoâ€¦' : 'Salva'}</button>
      </div>
    </Modale>
  );
}

/** I versamenti di una spesa: quelli giÃ  fatti e uno nuovo da registrare. */
function ModalePagamenti({ spesa, onClose, onCambiato }: { spesa: SpesaFornitore; onClose: () => void; onCambiato: () => void }) {
  const [lista, setLista] = useState<PagamentoSpesa[] | null>(null);
  const [residuo, setResiduo] = useState(spesa.residuo);
  const [importo, setImporto] = useState(String(spesa.residuo).replace('.', ','));
  const [pagatoIl, setPagatoIl] = useState(soloData(new Date().toISOString()));
  const [metodo, setMetodo] = useState<MetodoPagamento>('BONIFICO');
  const [riferimento, setRiferimento] = useState('');
  const [salvando, setSalvando] = useState(false);

  function ricarica() {
    pagamentiFornitoriApi.pagamenti(spesa.id)
      .then((p) => {
        setLista(p);
        const pagato = p.reduce((t, x) => t + Number(x.importo), 0);
        const resta = Math.max(0, Math.round((spesa.importo - pagato) * 100) / 100);
        setResiduo(resta);
        setImporto(String(resta).replace('.', ','));
      })
      .catch((e) => notifica(`Pagamenti non caricati: ${motivoErrore(e)}`, 'errore'));
  }
  useEffect(ricarica, [spesa.id]);

  async function registra() {
    const valore = Number(importo.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valore) || valore <= 0) { notifica("L'importo deve essere un numero maggiore di zero.", 'errore'); return; }
    if (!pagatoIl) { notifica('Indica la data del pagamento.', 'errore'); return; }
    setSalvando(true);
    try {
      await pagamentiFornitoriApi.registraPagamento(spesa.id, { importo: valore, pagatoIl, metodo, riferimento: riferimento.trim() || null });
      notifica('Pagamento registrato.', 'successo');
      setRiferimento('');
      ricarica();
      onCambiato();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  async function elimina(p: PagamentoSpesa) {
    const ok = await conferma({
      titolo: 'Togliere il pagamento?',
      testo: <>{formattaEuro(Number(p.importo))} del {formattaData(p.pagatoIl)} tornano tra i soldi da pagare.</>,
      conferma: 'Togli',
    });
    if (!ok) return;
    try {
      await pagamentiFornitoriApi.eliminaPagamento(p.id);
      notifica('Pagamento tolto.', 'successo');
      ricarica();
      onCambiato();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  return (
    <Modale titolo={`Pagamenti â€” ${spesa.fornitoreNome}`} onClose={onClose} larga>
      <p className="testo-intro">
        {spesa.descrizione} Â· spesa di <b>{formattaEuro(spesa.importo)}</b>, restano <b>{formattaEuro(residuo)}</b>.
      </p>

      {lista === null && <p className="testo-intro">Caricoâ€¦</p>}
      {lista && lista.length > 0 && (
        <div className="table-scroll adattiva">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th style={{ textAlign: 'right' }}>Importo</th>
                <th>Metodo</th>
                <th>Riferimento</th>
                <th>Registrato da</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{formattaData(p.pagatoIl)}</td>
                  <td style={{ textAlign: 'right' }}>{formattaEuro(Number(p.importo))}</td>
                  <td>{ETICHETTA_METODO[p.metodo]}</td>
                  <td>{p.riferimento ?? <span className="testo-secondario">â€”</span>}</td>
                  <td>{p.registratoDaNome ?? <span className="testo-secondario">â€”</span>}</td>
                  <td className="azioni-riga"><button type="button" className="btn btn-ghost btn-piccolo" onClick={() => elimina(p)}>Togli</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lista && lista.length === 0 && <p className="testo-intro">Nessun pagamento registrato.</p>}

      {residuo > 0 && (
        <>
          <PanelHead titolo="Registra un pagamento" />
          <div className="form-grid">
            <label>
              <span>Importo (â‚¬)</span>
              <input type="text" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
            </label>
            <label>
              <span>Data</span>
              <input type="date" value={pagatoIl} onChange={(e) => setPagatoIl(e.target.value)} />
            </label>
            <label>
              <span>Metodo</span>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}>
                {Object.entries(ETICHETTA_METODO).map(([valore, etichetta]) => <option key={valore} value={valore}>{etichetta}</option>)}
              </select>
            </label>
            <label>
              <span>Riferimento (CRO, numero bonificoâ€¦)</span>
              <input type="text" value={riferimento} onChange={(e) => setRiferimento(e.target.value)} />
            </label>
          </div>
          <div className="modal-azioni">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Chiudi</button>
            <button type="button" className="btn btn-primary" onClick={registra} disabled={salvando}>{salvando ? 'Registroâ€¦' : 'Registra il pagamento'}</button>
          </div>
        </>
      )}
      {residuo <= 0 && (
        <div className="modal-azioni">
          <button type="button" className="btn btn-primary" onClick={onClose}>Chiudi</button>
        </div>
      )}
    </Modale>
  );
}

const ETICHETTA_METODO: Record<MetodoPagamento, string> = {
  BONIFICO: 'Bonifico',
  CONTANTI: 'Contanti',
  CARTA: 'Carta',
  ALTRO: 'Altro',
};

/** "2026-10-15" da una data ISO, per gli <input type="date">. */
function soloData(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}
