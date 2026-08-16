import { useEffect, useState } from 'react';
import { eventiApi, type CalcoloBusLinea, type BusFisico, type BusFisicoInput } from '../../../api/eventi';
import { fornitoriApi, type Fornitore } from '../../../api/fornitori';
import { tourLeaderApi, type TourLeader } from '../../../api/tourleader';
import { ErroreApi } from '../../../api/client';
import { Modale } from '../../shared/Modale';

const BUS_VUOTO: BusFisicoInput = { riferimento: '', lineeIds: [] };

/** Genera e scarica un file CSV (si apre in Excel) con l'elenco
 *  passeggeri di un bus — la "lista tipo Excel" da dare al tour leader. */
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

/** Sezione "Partenze" di un singolo evento: calcolo bus necessari,
 *  copertura tratte, censimento bus fisici. Va dentro la scheda
 *  dell'evento (tab), non è più una pagina a sé con selettore evento. */
export function PartenzeTab({ eventoId }: { eventoId: string }) {
  const [calcolo, setCalcolo] = useState<CalcoloBusLinea[]>([]);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [generandoLista, setGenerandoLista] = useState<string | null>(null);

  const [inModifica, setInModifica] = useState<BusFisico | null>(null);
  const [form, setForm] = useState<BusFisicoInput>(BUS_VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() {
    setCaricamento(true);
    setErrore('');
    Promise.all([eventiApi.calcolaBus(eventoId), eventiApi.listaBus(eventoId)])
      .then(([c, b]) => { setCalcolo(c); setBusLista(b); })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la sezione Partenze. Controlla i tuoi permessi o riprova.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    tourLeaderApi.list().then(setTourLeaders).catch(() => setTourLeaders([]));
  }, [eventoId]);

  async function toggleCopertura(linea: CalcoloBusLinea) {
    try {
      await eventiApi.impostaCopertura(eventoId, linea.lineaId, !linea.coperta);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  function apriNuovoBus() { setInModifica(null); setForm(BUS_VUOTO); setModaleAperta(true); }
  function apriModificaBus(b: BusFisico) {
    setInModifica(b);
    setForm({ fornitoreId: b.fornitoreId ?? undefined, riferimento: b.riferimento, autistaNome: b.autistaNome ?? undefined, autistaTelefono: b.autistaTelefono ?? undefined, tourLeaderId: b.tourLeaderId, note: b.note ?? undefined, lineeIds: b.lineeIds });
    setModaleAperta(true);
  }

  function toggleLineaForm(lineaId: string) {
    setForm((f) => ({
      ...f,
      lineeIds: f.lineeIds.includes(lineaId) ? f.lineeIds.filter((id) => id !== lineaId) : [...f.lineeIds, lineaId],
    }));
  }

  async function salvaBus() {
    if (!form.riferimento || form.lineeIds.length === 0) {
      alert('Indica un riferimento per il bus e seleziona almeno una tratta che copre.');
      return;
    }
    try {
      if (inModifica) await eventiApi.aggiornaBus(eventoId, inModifica.id, form);
      else await eventiApi.creaBus(eventoId, form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    }
  }
  async function rimuoviBus(b: BusFisico) {
    if (!confirm(`Rimuovere il bus "${b.riferimento}" dal censimento?`)) return;
    try {
      await eventiApi.rimuoviBus(eventoId, b.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  async function generaLista(b: BusFisico) {
    setGenerandoLista(b.id);
    try {
      const righe = await eventiApi.listaPasseggeriBus(eventoId, b.id);
      if (righe.length === 0) {
        alert('Nessun passeggero confermato ancora su questo bus.');
        return;
      }
      scaricaListaCsv(b.riferimento, righe);
      // L'invio diretto all'account del tour leader arriverà appena
      // definiamo insieme come funzionerà l'account — per ora la lista
      // si scarica qui e la giri tu.
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    } finally {
      setGenerandoLista(null);
    }
  }

  if (caricamento) return <p className="testo-intro">Caricamento...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  return (
    <div>
      {calcolo.length === 0 && (
        <p className="testo-intro">Questa scheda non ha ancora nessuna tratta configurata — vai nella tab "Dettagli" per aggiungerne una.</p>
      )}

      {calcolo.map((linea) => {
        const postiSuperati = linea.totalePasseggeri > linea.postiTotali;
        return (
        <div key={linea.lineaId} className="section-card" style={postiSuperati ? { borderColor: 'var(--pink)' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 }}>
            <div>
              <h3>{linea.nome}</h3>
              <p className="section-sub">{linea.totalePasseggeri} passeggeri confermati su {linea.postiTotali} posti previsti · capienza {linea.capienzaPerBus} posti/bus</p>
              {postiSuperati && (
                <span className="badge non-coperta" style={{ marginTop: 6, display: 'inline-block' }}>
                  ⚠ Posti superati di {linea.totalePasseggeri - linea.postiTotali}
                </span>
              )}
            </div>
            <button
              type="button"
              className={`badge badge-btn ${linea.coperta ? 'coperta' : 'non-coperta'}`}
              style={{ flexShrink: 0 }}
              onClick={() => toggleCopertura(linea)}
            >
              {linea.coperta ? '✓ Tratta coperta' : 'Non coperta — segna come coperta'}
            </button>
          </div>

          <p style={{ fontSize: 14, marginBottom: 10 }}>
            <strong>Bus suggeriti: {linea.busSuggeriti}</strong>
            <span style={{ color: 'var(--mist)' }}> — stima in base ai passeggeri per fermata; l'orario di ogni bus resta da compilare a mano.</span>
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            {linea.fermate.map((f) => (
              <span key={f.fermataId} className="chip">{f.citta} <span className="chip-num">{f.passeggeri}</span></span>
            ))}
          </div>

          <div className="section-divider">
            <p className="section-label">Bus registrati su questa tratta</p>
            {busLista.filter((b) => b.lineeIds.includes(linea.lineaId)).map((b) => (
              <div key={b.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                <span className="riga-titolo">
                  {b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}
                  {b.tourLeaderNome && <><br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>Tour leader: {b.tourLeaderNome}</span></>}
                </span>
                <span className="riga-meta">
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => generaLista(b)} disabled={generandoLista === b.id}>
                    {generandoLista === b.id ? 'Genero...' : '⤓ Genera lista'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => apriModificaBus(b)}>Modifica</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px', color: 'var(--pink)' }} onClick={() => rimuoviBus(b)}>Rimuovi</button>
                </span>
              </div>
            ))}
            {busLista.filter((b) => b.lineeIds.includes(linea.lineaId)).length === 0 && (
              <p className="testo-intro" style={{ marginBottom: 0, fontSize: 13 }}>Nessun bus ancora censito per questa tratta.</p>
            )}
          </div>
        </div>
        );
      })}

      {calcolo.length > 0 && (
        <button className="btn btn-primary" onClick={apriNuovoBus}>+ Censisci bus</button>
      )}

      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica bus' : 'Censisci nuovo bus'} onClose={() => setModaleAperta(false)}>
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
            {tourLeaders.length === 0 && (
              <p className="testo-intro" style={{ fontSize: 12, marginTop: 4 }}>Nessun tour leader censito — vai nella sezione "Tour Leader" per aggiungerne uno.</p>
            )}
          </div>
          <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>

          <p className="section-label" style={{ marginTop: 16 }}>Tratte coperte da questo bus</p>
          {calcolo.map((linea) => (
            <label key={linea.lineaId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 14 }}>
              <input type="checkbox" checked={form.lineeIds.includes(linea.lineaId)} onChange={() => toggleLineaForm(linea.lineaId)} />
              {linea.nome}
            </label>
          ))}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={salvaBus}>Salva bus</button>
        </Modale>
      )}
    </div>
  );
}
