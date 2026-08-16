import { useEffect, useState } from 'react';
import { tragittiApi, type Tragitto, type FermataTragitto } from '../../api/tragitti';
import { ErroreApi } from '../../api/client';
import { geocodifica, durataViaggio, attesa } from '../shared/geo';
import { OrarioInput } from '../shared/OrarioInput';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { PaginaSezione } from '../shared/PaginaSezione';
import { useAvvisoModificheNonSalvate } from '../shared/useAvvisoModificheNonSalvate';

function etichettaFermata(idx: number, totale: number) {
  if (idx === 0) return { testo: 'PARTENZA', colore: '#5be0a0' };
  if (idx === totale - 1 && totale > 1) return { testo: 'ARRIVO', colore: 'var(--pink)' };
  return { testo: `INTERMEDIA ${idx}`, colore: 'var(--amber)' };
}

export function TragittiScreen() {
  const [tragitti, setTragitti] = useState<Tragitto[]>([]);
  const [inModifica, setInModifica] = useState<Tragitto | null>(null);
  const [nome, setNome] = useState('');
  const [fermate, setFermate] = useState<FermataTragitto[]>([]);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [statoCalcolo, setStatoCalcolo] = useState('');
  const [calcolando, setCalcolando] = useState(false);
  const [snapshotIniziale, setSnapshotIniziale] = useState('');
  const [ricerca, setRicerca] = useState('');

  function ricarica() { tragittiApi.list().then(setTragitti); }
  useEffect(ricarica, []);

  function apriNuovo() {
    setInModifica(null); setNome('');
    const fermateVuote = [{ citta: '', indirizzo: '' }, { citta: '', indirizzo: '' }];
    setFermate(fermateVuote);
    setSnapshotIniziale(JSON.stringify({ nome: '', fermate: fermateVuote }));
    setStatoCalcolo('');
    setModaleAperta(true);
  }
  function apriModifica(t: Tragitto) {
    setInModifica(t); setNome(t.nome);
    const fermateNormalizzate = t.fermate.map((f) => ({ ...f, prezzo: f.prezzo ?? undefined }));
    const fermateIniziali = fermateNormalizzate.length ? fermateNormalizzate : [{ citta: '', indirizzo: '' }];
    setFermate(fermateIniziali);
    setSnapshotIniziale(JSON.stringify({ nome: t.nome, fermate: fermateIniziali }));
    setStatoCalcolo('');
    setModaleAperta(true);
  }

  function aggiornaFermata(idx: number, campo: keyof FermataTragitto, valore: string) {
    setFermate(fermate.map((f, i) => i === idx ? { ...f, [campo]: campo === 'prezzo' ? Number(valore) || undefined : valore } : f));
  }
  function aggiungiFermataIntermedia() {
    const nuova: FermataTragitto = { citta: '', indirizzo: '' };
    setFermate(fermate.length >= 2 ? [...fermate.slice(0, -1), nuova, fermate[fermate.length - 1]] : [...fermate, nuova]);
  }
  function rimuoviFermata(idx: number) {
    setFermate(fermate.filter((_, i) => i !== idx));
  }

  // ---- Calcolo orari dalle distanze reali (Nominatim + OSRM, come in V18) ----
  // Usa sempre l'ultima fermata (ARRIVO) come destinazione e risale a
  // ritroso, fermata per fermata, sommando i tempi di viaggio reali.
  async function calcolaOrari() {
    const fermateValide = fermate.filter((f) => f.indirizzo.trim());
    if (fermateValide.length < 2) { setStatoCalcolo('Servono almeno Partenza e Arrivo con indirizzo compilato.'); return; }
    const orarioArrivo = fermateValide[fermateValide.length - 1].orario;
    if (!orarioArrivo) { setStatoCalcolo("Inserisci l'orario nella fermata ARRIVO qui sopra prima di calcolare."); return; }

    setCalcolando(true);
    setStatoCalcolo('Localizzo gli indirizzi, un momento...');

    const risultatiGeo: Awaited<ReturnType<typeof geocodifica>>[] = [];
    let problemaRete = false;
    for (const f of fermateValide) {
      setStatoCalcolo(`Localizzo "${f.indirizzo}"...`);
      const r = await geocodifica(`${f.indirizzo}, ${f.citta}`);
      risultatiGeo.push(r);
      if (r.erroreRete) problemaRete = true;
      await attesa(1100); // rispetto il limite di Nominatim (max 1 richiesta/sec)
    }

    if (problemaRete) {
      setStatoCalcolo(
        'La richiesta a OpenStreetMap non è andata a buon fine (problema di rete, firewall o VPN). ' +
        'Apri la Console del browser (tasto F12 → scheda "Console") per vedere il dettaglio tecnico dell\'errore.'
      );
      setCalcolando(false);
      return;
    }

    const coordFermate = risultatiGeo.map((r) => r.coordinate);
    if (!coordFermate[coordFermate.length - 1]) {
      setStatoCalcolo("L'indirizzo della fermata ARRIVO non è stato trovato su OpenStreetMap. Prova a essere più preciso (es. aggiungi il numero civico o il CAP).");
      setCalcolando(false);
      return;
    }

    setStatoCalcolo('Calcolo le distanze tra le fermate...');
    const durate: (number | null)[] = [];
    for (let i = 0; i < coordFermate.length - 1; i++) {
      const a = coordFermate[i], b = coordFermate[i + 1];
      durate.push(a && b ? await durataViaggio(a, b) : null);
      await attesa(300);
    }

    let cursore = Number(orarioArrivo.split(':')[0]) * 60 + Number(orarioArrivo.split(':')[1]);
    const orariCalcolati = new Array<string>(fermateValide.length);
    orariCalcolati[fermateValide.length - 1] = orarioArrivo;
    let errori = 0;
    for (let i = fermateValide.length - 2; i >= 0; i--) {
      const durata = durate[i];
      if (durata === null || !coordFermate[i]) { errori++; orariCalcolati[i] = ''; continue; }
      cursore -= durata + 5; // 5 minuti di margine per fermata
      const h = Math.floor(((cursore % 1440) + 1440) % 1440 / 60);
      const m = ((cursore % 1440) + 1440) % 1440 % 60;
      orariCalcolati[i] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    let idxValide = 0;
    setFermate(fermate.map((f) => {
      if (!f.indirizzo.trim()) return f;
      const orario = orariCalcolati[idxValide]; idxValide++;
      return orario ? { ...f, orario } : f;
    }));

    setStatoCalcolo(errori
      ? `Fatto, ma ${errori} indirizzo/i non è stato localizzato: controllali manualmente.`
      : 'Orari calcolati e applicati alle fermate qui sopra.');
    setCalcolando(false);
  }

  async function salva() {
    if (!nome.trim()) { alert('Dai un nome al tragitto prima di salvarlo.'); return; }
    const fermateValide = fermate.filter((f) => f.citta.trim() && f.indirizzo.trim());
    for (let i = 0; i < fermateValide.length - 1; i++) {
      if (fermateValide[i].prezzo === undefined) {
        alert(`Manca il prezzo sulla fermata "${fermateValide[i].citta}" — è obbligatorio su tutte tranne l'ultima (l'arrivo).`);
        return;
      }
    }
    const payload = { nome, fermate: fermateValide };
    try {
      if (inModifica) await tragittiApi.update(inModifica.id, payload);
      else await tragittiApi.create(payload);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(t: Tragitto) {
    if (!confirm(`Eliminare il tragitto "${t.nome}"?`)) return;
    await tragittiApi.remove(t.id);
    ricarica();
  }

  const modificato = snapshotIniziale !== '' && JSON.stringify({ nome, fermate }) !== snapshotIniziale;
  const chiediConferma = useAvvisoModificheNonSalvate(modificato);

  const tragittiFiltrati = ricerca.trim()
    ? tragitti.filter((t) => `${t.nome} ${t.fermate.map((f) => f.citta).join(' ')}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : tragitti;

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica tragitto' : 'Nuovo tragitto'} onIndietro={() => setModaleAperta(false)} richiediConferma={() => chiediConferma(() => setModaleAperta(false))}>
        <div className="campo"><label>Nome tragitto</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>

        <p style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Fermate</p>
        {fermate.map((f, idx) => {
          const etichetta = etichettaFermata(idx, fermate.length);
          return (
            <div key={idx} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9.5, fontFamily: "'Space Mono',monospace", textTransform: 'uppercase', letterSpacing: 1, color: etichetta.colore }}>{etichetta.testo}</span>
                <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--pink)' }} onClick={() => rimuoviFermata(idx)}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginBottom: 6 }}>
                <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idx, 'citta', e.target.value)} />
                <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idx, 'indirizzo', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <OrarioInput value={f.orario ?? ''} onChange={(v) => aggiornaFermata(idx, 'orario', v)} placeholder="Orario" />
                {idx === fermate.length - 1 ? (
                  <span />
                ) : (
                  <input placeholder="Prezzo €" type="number" value={f.prezzo ?? ''} onChange={(e) => aggiornaFermata(idx, 'prezzo', e.target.value)} />
                )}
              </div>
            </div>
          );
        })}
        <button className="btn btn-ghost" style={{ marginBottom: 18 }} onClick={aggiungiFermataIntermedia}>+ Aggiungi fermata intermedia</button>

        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Calcola orari di partenza dalle distanze</p>
          <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 10 }}>
            Usa l'indirizzo e l'orario già inseriti nella fermata ARRIVO qui sopra come riferimento, e ricava a
            ritroso l'orario di ogni fermata precedente in base ai tempi di viaggio reali.
          </p>
          <button className="btn btn-ghost" onClick={calcolaOrari} disabled={calcolando}>{calcolando ? 'Calcolo...' : 'Calcola orari'}</button>
          {statoCalcolo && <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 8 }}>{statoCalcolo}</p>}
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva tragitto</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Tragitti" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo tragitto</button>} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome tragitto o città..." />
      {!tragittiFiltrati.length && <p style={{ color: 'var(--mist)' }}>{ricerca ? 'Nessun tragitto trovato.' : 'Nessun tragitto ancora.'}</p>}
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
