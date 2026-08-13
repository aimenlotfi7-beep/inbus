import { useEffect, useState } from 'react';
import { pagineApi, type PaginaCms, type ContenutoSito } from '../../api/pagine';
import { PanelHead } from '../shared/PanelHead';

const CHIAVI_PAGINE = ['faq', 'privacy', 'cookie', 'termini', 'lavora', 'chisiamo', 'contatti'];

export function ContenutiScreen() {
  const [pagine, setPagine] = useState<PaginaCms[]>([]);
  const [contenuti, setContenuti] = useState<ContenutoSito[]>([]);
  const [chiaveSelezionata, setChiaveSelezionata] = useState('faq');
  const [titolo, setTitolo] = useState('');
  const [contenuto, setContenuto] = useState('');

  function ricarica() {
    pagineApi.list().then(setPagine);
    pagineApi.listContenuti().then(setContenuti);
  }
  useEffect(ricarica, []);

  useEffect(() => {
    const pagina = pagine.find((p) => p.chiave === chiaveSelezionata);
    setTitolo(pagina?.titolo ?? '');
    setContenuto(pagina?.contenuto ?? '');
  }, [chiaveSelezionata, pagine]);

  async function salvaPagina() {
    await pagineApi.upsert(chiaveSelezionata, { titolo, contenuto });
    ricarica();
  }
  async function salvaContenuto(chiave: string, valore: string) {
    await pagineApi.upsertContenuto(chiave, valore);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Contenuti sito" />

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Pagine del sito</h3>
        <div className="campo">
          <label>Pagina</label>
          <select value={chiaveSelezionata} onChange={(e) => setChiaveSelezionata(e.target.value)}>
            {CHIAVI_PAGINE.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="campo"><label>Titolo</label><input value={titolo} onChange={(e) => setTitolo(e.target.value)} /></div>
        <div className="campo">
          <label>Contenuto (HTML)</label>
          <textarea value={contenuto} onChange={(e) => setContenuto(e.target.value)} rows={6}
            style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, color: 'var(--paper)', fontFamily: 'monospace', fontSize: 13 }} />
        </div>
        <button className="btn btn-primary" onClick={salvaPagina}>Salva pagina</button>
      </div>

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Testi configurabili (hero, statistiche, ecc.)</h3>
        {contenuti.map((c) => (
          <div className="campo" key={c.chiave}>
            <label>{c.chiave}</label>
            <input defaultValue={c.valore} onBlur={(e) => salvaContenuto(c.chiave, e.target.value)} />
          </div>
        ))}
        {!contenuti.length && <p style={{ color: 'var(--mist)', fontSize: 13 }}>Nessun contenuto configurato ancora.</p>}
      </div>
    </div>
  );
}
