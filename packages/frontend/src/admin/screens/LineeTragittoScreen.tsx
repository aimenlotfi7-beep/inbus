import { useEffect, useState } from 'react';
import { eventiApi, type BusFisico, type LineaInput } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { tourLeaderApi, type TourLeader } from '../../api/tourleader';
import { ErroreApi } from '../../api/client';
import { CampoNumero } from '../shared/CampoNumero';
import { PanelHead } from '../shared/PanelHead';

const LINEA_VUOTA: LineaInput = { riferimento: '', fermateIds: [] };

/** Genera e scarica un file CSV (si apre in Excel) con l'elenco
 *  passeggeri di un bus — la "lista tipo Excel" da dare al tour leader.
 *  Stessa funzione già usata in Partenze, duplicata qui apposta: questa
 *  pagina è pensata per stare da sola, senza dipendere da niente di
 *  interno a PartenzeTab. */
function scaricaListaCsv(riferimentoBus: string, righe: { pnr: string; nome: string; cognome: string; fermata: string; telefono: string; email: string }[]) {
  const intestazione = ['PNR', 'Nome', 'Cognome', 'Fermata', 'Telefono', 'Email'];
  const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const righeCsv = righe.map((r) => [r.pnr, r.nome, r.cognome, r.fermata, r.telefono, r.email].map(escapeCsv).join(';'));
  const csv = '\uFEFF' + [intestazione.join(';'), ...righeCsv].join('\n'); // BOM per accenti corretti in Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `passeggeri-${riferimentoBus.replace(/[^a-z0-9]+/gi, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pagina dedicata alla gestione delle Linee di UN tragitto specifico —
 *  prima era un modale dentro Partenze, ora un vero indirizzo a sé
 *  (?sezione=linee&evento=...&tragitto=...), raggiunto dal pulsante
 *  "Gestisci Linee" accanto a "Modifica orario/prezzo/posti". Legge il
 *  contesto (quale evento, quale tragitto) direttamente dall'indirizzo
 *  — stesso principio già usato in tutto il resto del gestionale
 *  (niente react-router qui dentro, solo le API del browser). */
export function LineeTragittoScreen() {
  const parametri = new URLSearchParams(window.location.search);
  const eventoId = parametri.get('evento');
  const tragittoId = parametri.get('tragitto');

  const [evento, setEvento] = useState<Evento | null>(null);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [generandoLista, setGenerandoLista] = useState<string | null>(null);

  const [inModifica, setInModifica] = useState<BusFisico | null>(null);
  const [form, setForm] = useState<LineaInput>(LINEA_VUOTA);
  const [formAperto, setFormAperto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function ricarica() {
    if (!eventoId) return;
    setCaricamento(true);
    setErrore('');
    Promise.all([eventiApi.getById(eventoId), eventiApi.listaBus(eventoId)])
      .then(([ev, b]) => { setEvento(ev); setBusLista(b); })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la pagina.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    tourLeaderApi.list().then(setTourLeaders).catch(() => setTourLeaders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

  function tornaAPartenze() {
    const url = new URL(window.location.href);
    url.searchParams.set('sezione', 'partenze');
    url.searchParams.delete('evento');
    url.searchParams.delete('tragitto');
    window.location.href = url.toString();
  }

  if (!eventoId || !tragittoId) {
    return (
      <div>
        <PanelHead titolo="Linee" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>
          Manca il riferimento all'evento o al tragitto — torna a Partenze e riprova dal pulsante "Gestisci Linee".
        </p>
        <button className="btn btn-ghost" onClick={tornaAPartenze}>← Torna a Partenze</button>
      </div>
    );
  }
  if (caricamento) return <p className="testo-intro">Caricamento...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;
  if (!evento) return null;

  // Da qui in poi sono sicuramente valorizzati (il controllo sopra
  // l'ha già garantito) — TypeScript non lo deduce da solo dentro le
  // funzioni più sotto (chiusure catturano il tipo originale, non
  // ristretto), quindi lo fisso qui una volta per tutte.
  const idEvento = eventoId;
  const idTragitto = tragittoId;

  const tragittoVero = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === idTragitto);
  if (!tragittoVero) {
    return (
      <div>
        <PanelHead titolo="Linee" />
        <p className="testo-intro" style={{ color: 'var(--pink)' }}>Questo tragitto non esiste più, o è stato eliminato.</p>
        <button className="btn btn-ghost" onClick={tornaAPartenze}>← Torna a Partenze</button>
      </div>
    );
  }

  const busTragitto = busLista.filter((b) => b.tragittiIds.includes(idTragitto));

  function apriNuovaLinea() {
    setInModifica(null);
    // Preseleziona tutte le fermate ATTIVE del tragitto — comodo punto
    // di partenza (copre tutto), si tolgono quelle che non servono.
    setForm({ ...LINEA_VUOTA, fermateIds: tragittoVero!.fermate.filter((f) => f.attivo).map((f) => f.id) });
    setFormAperto(true);
  }
  function apriModificaLinea(b: BusFisico) {
    setInModifica(b);
    // Un bus registrato col vecchio sistema (bus_tratte, l'intero
    // tragitto) non ha ancora nessuna riga in bus_fermate — lo traduco
    // qui: se non ha ancora fermate proprie, parto da tutte le fermate
    // attive del tragitto (equivalente a "copre tutto", il
    // comportamento di prima).
    const fermateIniziali = b.fermateIds.length > 0 ? b.fermateIds : tragittoVero!.fermate.filter((f) => f.attivo).map((f) => f.id);
    setForm({ fornitoreId: b.fornitoreId ?? undefined, riferimento: b.riferimento, autistaNome: b.autistaNome ?? undefined, autistaTelefono: b.autistaTelefono ?? undefined, tourLeaderId: b.tourLeaderId, costo: b.costo ? Number(b.costo) : undefined, postiBus: b.postiBus ?? undefined, note: b.note ?? undefined, fermateIds: fermateIniziali });
    setFormAperto(true);
  }

  async function salvaLinea() {
    if (!form.riferimento || form.fermateIds.length === 0) {
      alert('Indica un riferimento per la Linea e seleziona almeno una fermata che copre.');
      return;
    }
    if (!inModifica && !form.postiBus) {
      alert('Indica quanti posti ha il bus — è il dato che serve a calcolare da solo quanti posti sono disponibili sul tragitto.');
      return;
    }
    if (form.tourLeaderId) {
      const giaAssegnato = busLista.some((b) => b.tourLeaderId === form.tourLeaderId && b.id !== inModifica?.id);
      if (giaAssegnato) {
        alert('Questo tour leader è già assegnato a un altro bus di questo evento — un tour leader non può seguire due bus insieme.');
        return;
      }
    }
    setSalvando(true);
    try {
      if (inModifica) await eventiApi.aggiornaLinea(idEvento, inModifica.id, form);
      else await eventiApi.creaLinea(idEvento, { ...form, postiBus: form.postiBus as number });
      setFormAperto(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }
  async function rimuoviLinea(b: BusFisico) {
    if (!confirm(`Rimuovere il bus "${b.riferimento}" dal censimento?`)) return;
    try {
      await eventiApi.rimuoviBus(idEvento, b.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }
  async function generaLista(b: BusFisico) {
    setGenerandoLista(b.id);
    try {
      const righe = await eventiApi.listaPasseggeriBus(idEvento, b.id);
      if (righe.length === 0) { alert('Nessun passeggero confermato ancora su questo bus.'); return; }
      scaricaListaCsv(b.riferimento, righe);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    } finally {
      setGenerandoLista(null);
    }
  }

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={tornaAPartenze}>← Torna a Partenze</button>
      <PanelHead titolo={`Linee — ${tragittoVero.nome}`} info={`${evento.artista} · ogni Linea è un bus vero, con le fermate specifiche che copre — non deve per forza coprirle tutte.`} />

      <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={apriNuovaLinea}>+ Nuova Linea</button>

      {busTragitto.length === 0 ? (
        <p className="testo-intro">Nessuna Linea ancora per questo tragitto.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {busTragitto.map((b) => {
            const nomiFermateCoperte = tragittoVero.fermate.filter((f) => b.fermateIds.includes(f.id)).map((f) => f.citta);
            return (
              <div key={b.id} className="riga-cliccabile section-card" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                <span className="riga-titolo">
                  {b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}
                  {b.tourLeaderNome && <><br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>Tour leader: {b.tourLeaderNome}</span></>}
                  {nomiFermateCoperte.length > 0 && <><br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>Copre: {nomiFermateCoperte.join(', ')}</span></>}
                </span>
                <span className="riga-meta">
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => generaLista(b)} disabled={generandoLista === b.id}>
                    {generandoLista === b.id ? 'Genero...' : '⤓ Genera lista'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => apriModificaLinea(b)}>Modifica</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px', color: 'var(--pink)' }} onClick={() => rimuoviLinea(b)}>Rimuovi</button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {formAperto && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>{inModifica ? 'Modifica Linea' : 'Nuova Linea'}</p>
          <div className="campo"><label>Riferimento (es. targa, o codice dell'agenzia)</label><input value={form.riferimento} onChange={(e) => setForm({ ...form, riferimento: e.target.value })} /></div>
          <div className="campo">
            <label>Fornitore</label>
            <select value={form.fornitoreId ?? ''} onChange={(e) => setForm({ ...form, fornitoreId: e.target.value || undefined })}>
              <option value="">— Nessuno —</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="campo"><label>Autista (facoltativo)</label><input value={form.autistaNome ?? ''} onChange={(e) => setForm({ ...form, autistaNome: e.target.value })} /></div>
          <div className="campo"><label>Telefono autista (facoltativo)</label><input value={form.autistaTelefono ?? ''} onChange={(e) => setForm({ ...form, autistaTelefono: e.target.value })} /></div>
          <div className="campo">
            <label>Tour leader assegnato</label>
            <select value={form.tourLeaderId ?? ''} onChange={(e) => setForm({ ...form, tourLeaderId: e.target.value || null })}>
              <option value="">— Nessuno —</option>
              {tourLeaders.map((t) => <option key={t.id} value={t.id}>{t.nome} {t.cognome} ({t.stato === 'ATTIVO' ? 'attivo' : t.stato === 'CANDIDATO' ? 'candidato' : 'archiviato'})</option>)}
            </select>
          </div>
          <div className="campo"><label>Posti del bus — è questo il dato che determina i posti disponibili sul tragitto</label><CampoNumero min={0} value={form.postiBus} onChange={(v) => setForm({ ...form, postiBus: v })} /></div>
          <div className="campo"><label>Costo del bus (facoltativo — usato per calcolare il guadagno della tratta)</label><CampoNumero valuta min={0} value={form.costo} onChange={(v) => setForm({ ...form, costo: v })} /></div>
          <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>

          <p className="section-label" style={{ marginTop: 16 }}>Fermate coperte da questa Linea</p>
          <p className="testo-intro" style={{ marginTop: -6, marginBottom: 8 }}>
            Nell'ordine del tragitto — non puoi selezionarne una saltando quelle prima di lei nel percorso.
          </p>
          {tragittoVero.fermate.map((f, idx) => {
            const selezionata = form.fermateIds.includes(f.id);
            const precedentiTutteSelezionate = tragittoVero.fermate.slice(0, idx).every((prec) => form.fermateIds.includes(prec.id));
            return (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5, opacity: !selezionata && !precedentiTutteSelezionate ? 0.45 : 1 }}>
                <input
                  type="checkbox"
                  checked={selezionata}
                  onChange={(e) => {
                    if (e.target.checked && !precedentiTutteSelezionate) {
                      alert(`Prima di "${f.citta}" devi selezionare tutte le fermate che la precedono in questo tragitto — l'ordine del percorso non si può saltare.`);
                      return;
                    }
                    setForm((v) => ({
                      ...v,
                      fermateIds: e.target.checked
                        ? [...v.fermateIds, f.id]
                        : v.fermateIds.filter((id) => !tragittoVero.fermate.slice(idx).map((ff) => ff.id).includes(id)),
                    }));
                  }}
                />
                {f.citta}
              </label>
            );
          })}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvaLinea} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva Linea'}</button>
            <button className="btn btn-ghost" onClick={() => setFormAperto(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
