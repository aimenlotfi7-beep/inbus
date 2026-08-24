import { useEffect, useState } from 'react';
import { percorsiSalvatiApi, type PercorsoSalvato, type FermataPercorsoSalvato } from '../../api/percorsiSalvati';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { CampoNumero } from '../shared/CampoNumero';
import { RicercaSezione } from '../shared/RicercaSezione';
import { PaginaSezione } from '../shared/PaginaSezione';
import { useAvvisoModificheNonSalvate } from '../shared/useAvvisoModificheNonSalvate';

/**
 * I percorsi sono solo template di fermate+prezzo, riutilizzabili su
 * qualunque evento — niente orari qui: l'arrivo (destinazione + orario)
 * cambia a ogni evento anche riusando lo stesso tragitto, quindi si
 * imposta e si calcola direttamente sulla tratta dell'evento (tab
 * Dettagli → Tratte), non qui.
 */
export function PercorsiSalvatiScreen() {
  const [percorsi, setTragitti] = useState<PercorsoSalvato[]>([]);
  const [inModifica, setInModifica] = useState<PercorsoSalvato | null>(null);
  const [nome, setNome] = useState('');
  const [fermate, setFermate] = useState<FermataPercorsoSalvato[]>([]);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [snapshotIniziale, setSnapshotIniziale] = useState('');
  const [ricerca, setRicerca] = useState('');

  function ricarica() { percorsiSalvatiApi.list().then(setTragitti); }
  useEffect(ricarica, []);

  function apriNuovo() {
    setInModifica(null); setNome('');
    const fermateVuote = [{ citta: '', indirizzo: '' }];
    setFermate(fermateVuote);
    setSnapshotIniziale(JSON.stringify({ nome: '', fermate: fermateVuote }));
    setModaleAperta(true);
  }
  function apriModifica(t: PercorsoSalvato) {
    setInModifica(t); setNome(t.nome);
    const fermateNormalizzate = t.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, prezzo: f.prezzo ?? undefined }));
    const fermateIniziali: FermataPercorsoSalvato[] = fermateNormalizzate.length ? fermateNormalizzate : [{ citta: '', indirizzo: '' }];
    setFermate(fermateIniziali);
    setSnapshotIniziale(JSON.stringify({ nome: t.nome, fermate: fermateIniziali }));
    setModaleAperta(true);
  }

  function aggiornaFermata(idx: number, campo: keyof FermataPercorsoSalvato, valore: string) {
    setFermate(fermate.map((f, i) => i === idx ? { ...f, [campo]: campo === 'prezzo' ? Number(valore) || undefined : valore } : f));
  }
  function aggiungiFermata() {
    setFermate([...fermate, { citta: '', indirizzo: '' }]);
  }
  function rimuoviFermata(idx: number) {
    setFermate(fermate.filter((_, i) => i !== idx));
  }

  async function salva() {
    if (!nome.trim()) { alert('Dai un nome al percorso prima di salvarlo.'); return; }
    const fermateValide = fermate.filter((f) => f.citta.trim() && f.indirizzo.trim());
    if (fermateValide.length === 0) { alert('Aggiungi almeno una fermata.'); return; }
    for (const f of fermateValide) {
      if (f.prezzo === undefined) {
        alert(`Manca il prezzo sulla fermata "${f.citta}" — è obbligatorio su tutte.`);
        return;
      }
    }
    const payload = { nome, fermate: fermateValide };
    try {
      if (inModifica) await percorsiSalvatiApi.update(inModifica.id, payload);
      else await percorsiSalvatiApi.create(payload);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(t: PercorsoSalvato) {
    if (!confirm(`Eliminare il percorso "${t.nome}"?`)) return;
    await percorsiSalvatiApi.remove(t.id);
    ricarica();
  }

  const modificato = snapshotIniziale !== '' && JSON.stringify({ nome, fermate }) !== snapshotIniziale;
  const chiediConferma = useAvvisoModificheNonSalvate(modificato);

  const tragittiFiltrati = ricerca.trim()
    ? percorsi.filter((t) => `${t.nome} ${t.fermate.map((f) => f.citta).join(' ')}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : percorsi;

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica percorso' : 'Nuovo percorso'} onIndietro={() => setModaleAperta(false)} richiediConferma={() => chiediConferma(() => setModaleAperta(false))}>
        <div className="campo"><label>Nome percorso</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>

        <p style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Fermate (con prezzo — l'arrivo si imposta poi sull'evento)</p>
        {fermate.map((f, idx) => (
          <div key={idx} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9.5, fontFamily: "'Space Mono',monospace", textTransform: 'uppercase', letterSpacing: 1, color: idx === 0 ? '#5be0a0' : 'var(--amber)' }}>
                {idx === 0 ? 'PARTENZA' : `FERMATA ${idx + 1}`}
              </span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--pink)' }} onClick={() => rimuoviFermata(idx)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr .6fr', gap: 8 }}>
              <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idx, 'citta', e.target.value)} />
              <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idx, 'indirizzo', e.target.value)} />
              <CampoNumero valuta placeholder="Prezzo" value={f.prezzo} onChange={(v) => aggiornaFermata(idx, 'prezzo', v !== undefined ? String(v) : '')} />
            </div>
          </div>
        ))}
        <button className="btn btn-ghost" style={{ marginBottom: 18 }} onClick={aggiungiFermata}>+ Aggiungi fermata</button>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva percorso</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Percorsi salvati" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo percorso</button>} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome percorso o città..." />
      {!tragittiFiltrati.length && <p style={{ color: 'var(--mist)' }}>{ricerca ? 'Nessun percorso trovato.' : 'Nessun percorso ancora.'}</p>}
      <div className="cards-list">
        {tragittiFiltrati.map((t) => (
          <div key={t.id} className="evento-card" onClick={() => apriModifica(t)}>
            <h3>{t.nome}</h3>
            <p>{t.fermate.map((f) => f.citta).filter(Boolean).join(' → ') || 'Nessuna fermata'}</p>
            <button className="btn btn-ghost" style={{ marginTop: 10, fontSize: 11, color: 'var(--pink)' }} onClick={(e) => { e.stopPropagation(); elimina(t); }}>Elimina</button>
          </div>
        ))}
      </div>
    </div>
  );
}
