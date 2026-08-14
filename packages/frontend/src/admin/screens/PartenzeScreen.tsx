import { useEffect, useState } from 'react';
import { eventiApi, type CalcoloBusLinea, type BusFisico, type BusFisicoInput } from '../../api/eventi';
import { fornitoriApi, type Fornitore } from '../../api/fornitori';
import { ErroreApi } from '../../api/client';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { Modale } from '../shared/Modale';

const BUS_VUOTO: BusFisicoInput = { riferimento: '', lineeIds: [] };

export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [calcolo, setCalcolo] = useState<CalcoloBusLinea[]>([]);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [caricamento, setCaricamento] = useState(false);

  const [inModifica, setInModifica] = useState<BusFisico | null>(null);
  const [form, setForm] = useState<BusFisicoInput>(BUS_VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  useEffect(() => {
    eventiApi.list().then((lista) => {
      setEventi(lista);
      if (lista.length && !eventoId) setEventoId(lista[0].id);
    });
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
  }, []);

  function ricaricaEvento(id: string) {
    if (!id) return;
    setCaricamento(true);
    Promise.all([eventiApi.calcolaBus(id), eventiApi.listaBus(id)])
      .then(([c, b]) => { setCalcolo(c); setBusLista(b); })
      .catch((e) => alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete nel caricare la sezione Partenze.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => { ricaricaEvento(eventoId); }, [eventoId]);

  async function toggleCopertura(linea: CalcoloBusLinea) {
    try {
      await eventiApi.impostaCopertura(eventoId, linea.lineaId, !linea.coperta);
      ricaricaEvento(eventoId);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  function apriNuovoBus() { setInModifica(null); setForm(BUS_VUOTO); setModaleAperta(true); }
  function apriModificaBus(b: BusFisico) { setInModifica(b); setForm({ fornitoreId: b.fornitoreId ?? undefined, riferimento: b.riferimento, autistaNome: b.autistaNome ?? undefined, autistaTelefono: b.autistaTelefono ?? undefined, note: b.note ?? undefined, lineeIds: b.lineeIds }); setModaleAperta(true); }

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
      ricaricaEvento(eventoId);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    }
  }
  async function rimuoviBus(b: BusFisico) {
    if (!confirm(`Rimuovere il bus "${b.riferimento}" dal censimento?`)) return;
    try {
      await eventiApi.rimuoviBus(eventoId, b.id);
      ricaricaEvento(eventoId);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  return (
    <div>
      <PanelHead titolo="Partenze" />

      <div className="campo" style={{ maxWidth: 420, marginBottom: 20 }}>
        <label>Evento</label>
        <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
          {eventi.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.artista} — {new Date(ev.data).toLocaleDateString('it-IT')}</option>
          ))}
        </select>
      </div>

      {caricamento && <p style={{ color: 'var(--mist)' }}>Caricamento...</p>}

      {!caricamento && calcolo.length === 0 && (
        <p style={{ color: 'var(--mist)' }}>Questo evento non ha ancora nessuna tratta/bus configurato (vai in Eventi per aggiungerne uno).</p>
      )}

      {!caricamento && calcolo.map((linea) => (
        <div key={linea.lineaId} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <h3 style={{ fontSize: 15, margin: 0 }}>{linea.nome}</h3>
              <p style={{ color: 'var(--mist)', fontSize: 12.5, margin: '4px 0 0' }}>
                {linea.totalePasseggeri} passeggeri confermati · capienza {linea.capienzaPerBus}/bus
              </p>
            </div>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '6px 12px', background: linea.coperta ? '#6fd6a0' : 'transparent', color: linea.coperta ? '#0a0a0a' : 'var(--pink)', border: linea.coperta ? 'none' : '1px solid var(--pink)' }}
              onClick={() => toggleCopertura(linea)}
            >
              {linea.coperta ? '✓ Tratta coperta' : 'Segna come coperta'}
            </button>
          </div>

          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>Bus suggeriti: {linea.busSuggeriti}</strong>
            <span style={{ color: 'var(--mist)' }}> (stima in base ai passeggeri per fermata — l'orario di ogni bus va comunque compilato a mano)</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {linea.fermate.map((f) => (
              <span key={f.fermataId} style={{ fontSize: 12, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px' }}>
                {f.citta}: {f.passeggeri}
              </span>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Bus registrati su questa tratta</p>
            {busLista.filter((b) => b.lineeIds.includes(linea.lineaId)).map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span>{b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}</span>
                <span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => apriModificaBus(b)}>Modifica</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--pink)' }} onClick={() => rimuoviBus(b)}>Rimuovi</button>
                </span>
              </div>
            ))}
            {busLista.filter((b) => b.lineeIds.includes(linea.lineaId)).length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--mist)' }}>Nessun bus ancora censito per questa tratta.</p>
            )}
          </div>
        </div>
      ))}

      {calcolo.length > 0 && (
        <button className="btn btn-primary" onClick={apriNuovoBus} style={{ marginTop: 4 }}>+ Censisci bus</button>
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

          <label style={{ display: 'block', margin: '14px 0 8px', fontWeight: 600 }}>Tratte coperte da questo bus</label>
          {calcolo.map((linea) => (
            <label key={linea.lineaId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5 }}>
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
