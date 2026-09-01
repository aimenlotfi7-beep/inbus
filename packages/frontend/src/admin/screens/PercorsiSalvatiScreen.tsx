import { useEffect, useState } from 'react';
import { percorsiSalvatiApi, type PercorsoSalvato, type FermataPercorsoSalvato } from '../../api/percorsiSalvati';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../api/fermateAnagrafica';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { CampoNumero } from '../shared/CampoNumero';
import { RicercaSezione } from '../shared/RicercaSezione';
import { PaginaSezione } from '../shared/PaginaSezione';
import { useAvvisoModificheNonSalvate } from '../shared/useAvvisoModificheNonSalvate';
import { MappaPercorso, type TappaMappa } from '../shared/MappaPercorso';

/**
 * I percorsi sono solo template di fermate+margine, riutilizzabili su
 * qualunque evento — niente orari qui: l'arrivo (destinazione + orario)
 * cambia a ogni evento anche riusando lo stesso tragitto, quindi si
 * imposta e si calcola direttamente in Partenze, non qui.
 *
 * "Margine" (campo interno ancora chiamato prezzo, solo l'etichetta è
 * cambiata) non è più il prezzo finale al cliente — è quanto vuoi
 * guadagnare come minimo su quella fermata, da sommare al costo vero
 * del bus (che si conosce solo dopo, in Partenze, quando confermi un
 * bus reale con un fornitore).
 */
export function PercorsiSalvatiScreen() {
  const [tab, setTab] = useState<'elenco' | 'cartina'>('elenco');
  const [percorsoCartinaId, setPercorsoCartinaId] = useState<string>('');
  const [percorsi, setTragitti] = useState<PercorsoSalvato[]>([]);
  const [inModifica, setInModifica] = useState<PercorsoSalvato | null>(null);
  const [nome, setNome] = useState('');
  const [fermate, setFermate] = useState<FermataPercorsoSalvato[]>([]);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [snapshotIniziale, setSnapshotIniziale] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [fermateAnagrafica, setFermateAnagrafica] = useState<FermataAnagrafica[]>([]);

  function ricarica() { percorsiSalvatiApi.list().then(setTragitti); }
  useEffect(ricarica, []);
  useEffect(() => { fermateAnagraficaApi.list().then(setFermateAnagrafica).catch(() => setFermateAnagrafica([])); }, []);

  function apriNuovo() {
    setInModifica(null); setNome('');
    // Le due Teste (partenza e arrivo) sono sempre presenti, anche
    // senza nessuna fermata intermedia in mezzo — un percorso senza
    // almeno queste due non ha senso.
    const fermateVuote = [{ citta: '', indirizzo: '' }, { citta: '', indirizzo: '' }];
    setFermate(fermateVuote);
    setSnapshotIniziale(JSON.stringify({ nome: '', fermate: fermateVuote }));
    setModaleAperta(true);
  }
  function apriModifica(t: PercorsoSalvato) {
    setInModifica(t); setNome(t.nome);
    const fermateNormalizzate = t.fermate.map((f) => ({ fermataAnagraficaId: f.fermataAnagraficaId ?? null, citta: f.citta, indirizzo: f.indirizzo, prezzo: f.prezzo ?? undefined, tipo: f.tipo, sogliaMinima: f.sogliaMinima }));
    const fermateIniziali: FermataPercorsoSalvato[] = fermateNormalizzate.length >= 2 ? fermateNormalizzate : [{ citta: '', indirizzo: '' }, { citta: '', indirizzo: '' }];
    setFermate(fermateIniziali);
    setSnapshotIniziale(JSON.stringify({ nome: t.nome, fermate: fermateIniziali }));
    setModaleAperta(true);
  }

  function aggiornaFermata(idx: number, campo: keyof FermataPercorsoSalvato, valore: string) {
    setFermate(fermate.map((f, i) => i === idx ? { ...f, [campo]: (campo === 'prezzo' || campo === 'sogliaMinima') ? (Number(valore) || undefined) : valore } : f));
  }
  function selezionaFermataAnagrafica(idx: number, anagraficaId: string) {
    if (anagraficaId === '__manuale__') {
      setFermate(fermate.map((f, i) => i === idx ? { ...f, fermataAnagraficaId: null } : f));
      return;
    }
    const trovata = fermateAnagrafica.find((f) => f.id === anagraficaId);
    if (!trovata) return;
    setFermate(fermate.map((f, i) => i === idx ? { ...f, fermataAnagraficaId: trovata.id, citta: trovata.citta, indirizzo: trovata.indirizzo } : f));
  }
  function aggiungiFermata() {
    // Va inserita PRIMA dell'ultima posizione — quella deve restare
    // sempre la Testa 2 (arrivo), non diventare una fermata intermedia
    // per sbaglio solo perché se n'è aggiunta una nuova in fondo.
    const nuove = [...fermate];
    nuove.splice(fermate.length - 1, 0, { citta: '', indirizzo: '' });
    setFermate(nuove);
  }
  function rimuoviFermata(idx: number) {
    if (fermate.length <= 2) { alert('Servono sempre almeno due fermate — le due Teste (partenza e arrivo).'); return; }
    setFermate(fermate.filter((_, i) => i !== idx));
  }

  const [salvando, setSalvando] = useState(false);
  async function salva() {
    if (salvando) return;
    if (!nome.trim()) { alert('Dai un nome al percorso prima di salvarlo.'); return; }
    // Le due Teste (prima e ultima fermata, posizione) possono restare
    // senza indirizzo — quello vero si scrive in Eventi, quando il
    // percorso viene applicato. Le fermate intermedie lo richiedono
    // comunque.
    const fermateValide = fermate.filter((f, idx) => f.citta.trim() && (idx === 0 || idx === fermate.length - 1 || f.indirizzo?.trim()));
    if (fermateValide.length < 2) { alert('Servono almeno due fermate — le due Teste (partenza e arrivo).'); return; }
    for (const f of fermateValide) {
      if (f.prezzo === undefined) {
        alert(`Manca il margine sulla fermata "${f.citta}" — è obbligatorio su tutte.`);
        return;
      }
    }
    const payload = { nome, fermate: fermateValide };
    setSalvando(true);
    try {
      if (inModifica) await percorsiSalvatiApi.update(inModifica.id, payload);
      else await percorsiSalvatiApi.create(payload);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally {
      setSalvando(false);
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

        <p style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Fermate (con margine — le due Teste si scrivono in Eventi)</p>
        {fermate.map((f, idx) => (
          <div key={idx} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9.5, fontFamily: "'Space Mono',monospace", textTransform: 'uppercase', letterSpacing: 1, color: (idx === 0 || idx === fermate.length - 1) ? '#5be0a0' : 'var(--amber)' }}>
                {idx === 0 || idx === fermate.length - 1 ? 'TESTA' : `FERMATA ${idx + 1}`}
              </span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--pink)' }} onClick={() => rimuoviFermata(idx)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: f.fermataAnagraficaId !== null ? '1fr .6fr' : '1fr 1.4fr .6fr', gap: 8 }}>
              {f.fermataAnagraficaId !== null ? (
                // Di default (e finché non si sceglie "scrivi
                // manualmente") si parte da qui — stesso identico
                // sistema già usato per le fermate dei tragitti veri.
                <select
                  style={{ gridColumn: 'span 1' }}
                  value={f.fermataAnagraficaId ?? ''}
                  onChange={(e) => selezionaFermataAnagrafica(idx, e.target.value)}
                >
                  <option value="" disabled>— Scegli una fermata dall'anagrafica —</option>
                  {fermateAnagrafica.map((fa) => (
                    <option key={fa.id} value={fa.id}>{fa.nome === fa.citta ? fa.nome : `${fa.nome} — ${fa.citta}`}</option>
                  ))}
                  <option value="__manuale__">✎ Scrivi manualmente, senza anagrafica...</option>
                </select>
              ) : (
                <>
                  <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idx, 'citta', e.target.value)} />
                  <input placeholder={(idx === 0 || idx === fermate.length - 1) ? 'Indirizzo (facoltativo — si scrive in Eventi)' : 'Indirizzo'} value={f.indirizzo ?? ''} onChange={(e) => aggiornaFermata(idx, 'indirizzo', e.target.value)} />
                </>
              )}
              <CampoNumero valuta placeholder="Margine" value={f.prezzo} onChange={(v) => aggiornaFermata(idx, 'prezzo', v !== undefined ? String(v) : '')} />
            </div>
            {f.fermataAnagraficaId === null && fermateAnagrafica.length > 0 && (
              <button
                type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginTop: 6 }}
                onClick={() => setFermate(fermate.map((ff, i) => i === idx ? { ...ff, fermataAnagraficaId: undefined, citta: '', indirizzo: '' } : ff))}
              >
                ← Torna a scegliere dall'anagrafica
              </button>
            )}
            {/* "Fermata di Partenza" (col significato di soglia minima —
                diverso dall'etichetta sopra, che è solo la posizione
                nell'ordine) si decide qui sul percorso, non più in
                Eventi: se lo stesso percorso si applica a più eventi,
                ha senso stabilirlo una volta sola. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5, color: 'var(--mist)' }}>
              <input
                type="checkbox"
                checked={f.tipo === 'PARTENZA'}
                onChange={(e) => aggiornaFermata(idx, 'tipo', e.target.checked ? 'PARTENZA' : 'PASSAGGIO')}
              />
              Richiede un minimo di partecipanti per convenire (es. la fermata più lontana)
            </label>
            {f.tipo === 'PARTENZA' && (
              <div style={{ marginTop: 4, maxWidth: 220 }}>
                <CampoNumero
                  placeholder="Soglia minima (default generale se vuoto)"
                  value={f.sogliaMinima ?? undefined}
                  onChange={(v) => aggiornaFermata(idx, 'sogliaMinima', v !== undefined ? String(v) : '')}
                />
              </div>
            )}
          </div>
        ))}
        <button className="btn btn-ghost" style={{ marginBottom: 18 }} onClick={aggiungiFermata}>+ Aggiungi fermata</button>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva percorso'}</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Percorsi salvati" azione={tab === 'elenco' && <button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo percorso</button>} />
      <div className="mini-tabs" style={{ marginBottom: 18 }}>
        <button type="button" className={`mini-tab${tab === 'elenco' ? ' active' : ''}`} onClick={() => setTab('elenco')}>Elenco</button>
        <button type="button" className={`mini-tab${tab === 'cartina' ? ' active' : ''}`} onClick={() => setTab('cartina')}>Cartina</button>
      </div>

      {tab === 'cartina' ? (
        <div>
          <div className="campo" style={{ maxWidth: 420, marginBottom: 16 }}>
            <label>Scegli un percorso</label>
            <select value={percorsoCartinaId} onChange={(e) => setPercorsoCartinaId(e.target.value)}>
              <option value="">— Seleziona —</option>
              {percorsi.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {(() => {
            const percorsoScelto = percorsi.find((p) => p.id === percorsoCartinaId);
            if (!percorsoScelto) return <p style={{ color: 'var(--mist)' }}>Scegli un percorso per vederlo sulla cartina.</p>;
            const tappe: TappaMappa[] = percorsoScelto.fermate.map((f, idx) => ({
              etichetta: `${(idx === 0 || idx === percorsoScelto.fermate.length - 1) ? 'Testa' : `Fermata ${idx + 1}`} — ${f.citta}`,
              citta: f.citta,
              indirizzo: f.indirizzo,
            }));
            if (tappe.length < 2) return <p style={{ color: 'var(--mist)' }}>Questo percorso ha meno di due fermate — niente da disegnare.</p>;
            return <MappaPercorso key={percorsoScelto.id} tappe={tappe} />;
          })()}
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
