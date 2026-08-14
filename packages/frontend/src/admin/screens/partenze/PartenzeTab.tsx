import { useEffect, useState } from 'react';
import { eventiApi, type CalcoloBusLinea, type BusFisico, type BusFisicoInput } from '../../../api/eventi';
import { fornitoriApi, type Fornitore } from '../../../api/fornitori';
import { ErroreApi } from '../../../api/client';
import { Modale } from '../../shared/Modale';

const BUS_VUOTO: BusFisicoInput = { riferimento: '', lineeIds: [] };

/** Sezione "Partenze" di un singolo evento: calcolo bus necessari,
 *  copertura tratte, censimento bus fisici. Va dentro la scheda
 *  dell'evento (tab), non è più una pagina a sé con selettore evento. */
export function PartenzeTab({ eventoId }: { eventoId: string }) {
  const [calcolo, setCalcolo] = useState<CalcoloBusLinea[]>([]);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

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
    setForm({ fornitoreId: b.fornitoreId ?? undefined, riferimento: b.riferimento, autistaNome: b.autistaNome ?? undefined, autistaTelefono: b.autistaTelefono ?? undefined, note: b.note ?? undefined, lineeIds: b.lineeIds });
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

  if (caricamento) return <p className="testo-intro">Caricamento...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  return (
    <div>
      {calcolo.length === 0 && (
        <p className="testo-intro">Questa scheda non ha ancora nessuna tratta configurata — vai nella tab "Dettagli" per aggiungerne una.</p>
      )}

      {calcolo.map((linea) => (
        <div key={linea.lineaId} className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 }}>
            <div>
              <h3>{linea.nome}</h3>
              <p className="section-sub">{linea.totalePasseggeri} passeggeri confermati · capienza {linea.capienzaPerBus} posti/bus</p>
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
              <div key={b.id} className="riga-cliccabile" style={{ cursor: 'default' }}>
                <span className="riga-titolo">{b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}</span>
                <span className="riga-meta">
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
      ))}

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
