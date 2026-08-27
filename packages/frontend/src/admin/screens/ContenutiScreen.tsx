import { useEffect, useState } from 'react';
import { pagineApi, type PaginaCms, type ContenutoSito } from '../../api/pagine';
import { categorieApi, type Categoria } from '../../api/categorie';
import { categorieEventoApi, type CategoriaEvento } from '../../api/categorieEvento';
import { PanelHead } from '../shared/PanelHead';
import { ErroreApi } from '../../api/client';

const CHIAVI_PAGINE = ['faq', 'privacy', 'cookie', 'termini', 'lavora', 'chisiamo', 'contatti'];

export function ContenutiScreen() {
  const [pagine, setPagine] = useState<PaginaCms[]>([]);
  const [contenuti, setContenuti] = useState<ContenutoSito[]>([]);
  const [chiaveSelezionata, setChiaveSelezionata] = useState('faq');
  const [titolo, setTitolo] = useState('');
  const [contenuto, setContenuto] = useState('');

  // Generi (testo libero associato agli eventi) e Categorie (i
  // pulsanti fissi in alto sul sito) — stessa idea, due elenchi
  // separati, entrambi gestibili anche direttamente qui invece che
  // solo al volo mentre si modifica un evento.
  const [generi, setGeneri] = useState<Categoria[]>([]);
  const [categorieEvento, setCategorieEvento] = useState<CategoriaEvento[]>([]);
  function ricaricaGeneri() { categorieApi.list().then(setGeneri); }
  function ricaricaCategorieEvento() { categorieEventoApi.list().then(setCategorieEvento); }
  useEffect(() => { ricaricaGeneri(); ricaricaCategorieEvento(); }, []);

  async function nuovoGenere() {
    const nome = window.prompt('Nome del nuovo genere:');
    if (!nome || !nome.trim()) return;
    try {
      await categorieApi.create(nome.trim());
      ricaricaGeneri();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile creare: ${e.message}` : 'Impossibile creare: errore di rete.');
    }
  }
  async function eliminaGenere(g: Categoria) {
    if (!confirm(`Eliminare il genere "${g.nome}"? Gli eventi che lo usano già lo mantengono comunque scritto, semplicemente non comparirà più nell'elenco per sceglierlo su altri eventi.`)) return;
    try {
      await categorieApi.remove(g.id);
      ricaricaGeneri();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile eliminare: ${e.message}` : 'Impossibile eliminare: errore di rete.');
    }
  }
  async function nuovaCategoriaEvento() {
    const nome = window.prompt('Nome della nuova categoria (comparirà come pulsante in alto sul sito):');
    if (!nome || !nome.trim()) return;
    try {
      await categorieEventoApi.create(nome.trim());
      ricaricaCategorieEvento();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile creare: ${e.message}` : 'Impossibile creare: errore di rete.');
    }
  }
  async function eliminaCategoriaEvento(c: CategoriaEvento) {
    if (!confirm(`Eliminare la categoria "${c.nome}"? Sparirà anche dai pulsanti in alto sul sito. Gli eventi che la usano già la mantengono comunque scritta.`)) return;
    try {
      await categorieEventoApi.remove(c.id);
      ricaricaCategorieEvento();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile eliminare: ${e.message}` : 'Impossibile eliminare: errore di rete.');
    }
  }

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

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Categorie (i pulsanti in alto sul sito)</h3>
        <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 14 }}>Si associano a un evento dalla sua scheda, sezione Informazioni.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {categorieEvento.map((c) => (
            <span key={c.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {c.nome}
              <button type="button" onClick={() => eliminaCategoriaEvento(c)} title="Elimina" style={{ background: 'none', border: 'none', color: 'var(--pink)', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
            </span>
          ))}
          {!categorieEvento.length && <p style={{ color: 'var(--mist)', fontSize: 13 }}>Nessuna categoria ancora.</p>}
        </div>
        <button className="btn btn-ghost" onClick={nuovaCategoriaEvento}>+ Nuova categoria</button>
      </div>

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Generi</h3>
        <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 14 }}>Testo libero associato a ogni evento — diverso dalle categorie qui sopra.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {generi.map((g) => (
            <span key={g.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {g.nome}
              <button type="button" onClick={() => eliminaGenere(g)} title="Elimina" style={{ background: 'none', border: 'none', color: 'var(--pink)', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
            </span>
          ))}
          {!generi.length && <p style={{ color: 'var(--mist)', fontSize: 13 }}>Nessun genere ancora.</p>}
        </div>
        <button className="btn btn-ghost" onClick={nuovoGenere}>+ Nuovo genere</button>
      </div>

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Testi Hero homepage</h3>
        <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 14 }}>Il primo blocco che si vede aprendo il sito — titolo, sottotitolo, etichette delle statistiche.</p>
        {[
          { chiave: 'hero_eyebrow', etichetta: 'Etichetta sopra il titolo', default: 'Bus per concerti in tutta Italia' },
          { chiave: 'hero_titolo_riga1', etichetta: 'Titolo — prima riga', default: 'Sali sul bus.' },
          { chiave: 'hero_titolo_riga2', etichetta: 'Titolo — seconda riga (colorata)', default: 'Vivi il concerto.' },
          { chiave: 'hero_sottotitolo', etichetta: 'Sottotitolo', default: 'Andata e ritorno in giornata, direttamente dalla tua città al palco del tuo artista preferito. Un solo biglietto, zero pensieri.' },
          { chiave: 'hero_statistica1_etichetta', etichetta: 'Etichetta statistica 1 (il numero è calcolato da solo)', default: 'Partenze attive' },
          { chiave: 'hero_statistica2_etichetta', etichetta: 'Etichetta statistica 2 (il numero è calcolato da solo)', default: 'Città di partenza' },
        ].map(({ chiave, etichetta, default: valoreDefault }) => (
          <div className="campo" key={chiave}>
            <label>{etichetta}</label>
            <input
              defaultValue={contenuti.find((c) => c.chiave === chiave)?.valore ?? valoreDefault}
              onBlur={(e) => salvaContenuto(chiave, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Sfondo homepage</h3>
        <div className="campo">
          <label>URL immagine di sfondo</label>
          <input
            defaultValue={contenuti.find((c) => c.chiave === 'sfondoUrl')?.valore ?? ''}
            placeholder="https://..."
            onBlur={(e) => salvaContenuto('sfondoUrl', e.target.value)}
          />
        </div>
      </div>

      <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Testi configurabili (hero, statistiche, ecc.)</h3>
        {contenuti.filter((c) => c.chiave !== 'sfondoUrl' && !c.chiave.startsWith('hero_') && !c.chiave.startsWith('tooltip_')).map((c) => (
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
