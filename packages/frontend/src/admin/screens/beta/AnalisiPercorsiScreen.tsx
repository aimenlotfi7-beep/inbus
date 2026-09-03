import { useEffect, useState } from 'react';
import { eventiApi, type VenditePerFermata } from '../../../api/eventi';
import type { Evento } from '../../../api/types';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { impostazioniApi } from '../../../api/impostazioni';
import { geocodifica, type Coordinate } from '../../shared/geo';
import { PanelHead } from '../../shared/PanelHead';
import { CampoNumero } from '../../shared/CampoNumero';

/** In km, in linea d'aria — semplice e veloce apposta per questa prima
 *  versione (Fase 1, solo analisi): un raffronto sul tracciato stradale
 *  vero (come già fa la Cartina Percorsi con OSRM) è previsto come
 *  passo successivo, se questo primo giro si rivela utile davvero. */
function distanzaLineaRetta(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function minutiDa(orario: string): number | null {
  const m = orario.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

interface FermataConCoordinate { id: string; citta: string; orario: string | null; coord: Coordinate | null; nonLocalizzata: boolean; prezzo: number | null; confermati: number; }
interface TragittoAnalisi { tragittoId: string; nome: string; orarioPartenza: string | null; fermate: FermataConCoordinate[]; preventivoCosto: number | null; }
interface CoppiaVicina { fermataA: FermataConCoordinate; fermataB: FermataConCoordinate; distanzaKm: number; }
interface CoppiaTragitti { a: TragittoAnalisi; b: TragittoAnalisi; differenzaMinuti: number; coppieFermate: CoppiaVicina[]; }
// Un GRUPPO può avere più di due tragitti — se A è vicino a B, e B è
// vicino a C, i tre finiscono nello stesso gruppo anche se A e C non
// sono direttamente vicini tra loro (il bus li tocca comunque tutti e
// tre in sequenza). "coppie" tiene il dettaglio di OGNI legame diretto
// trovato dentro il gruppo, per la tabella di trasparenza.
interface GruppoTragitti { tragitti: TragittoAnalisi[]; coppie: CoppiaTragitti[]; }

/** Strumento in prova (Fase 1 del progetto "Linee combinate" di cui
 *  abbiamo parlato) — SOLO lettura, nessuna scrittura su nulla: legge
 *  gli stessi dati già visibili in Partenze (tragitti, fermate,
 *  orari), non li tocca, non è collegato a nessuna schermata di
 *  Partenze. Serve a scoprire, dentro UN evento, quali coppie di
 *  tragitti hanno fermate vicine E orari di partenza compatibili —
 *  candidati papabili per un domani costruire un bus unico che li
 *  copra entrambi (quella parte, la Fase 2/3, non è ancora costruita:
 *  oggi una Linea resta legata a un solo tragitto). */
export function AnalisiPercorsiScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [raggioKm, setRaggioKm] = useState(30);
  const [finestraMinuti, setFinestraMinuti] = useState(90);
  const [analizzando, setAnalizzando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [risultati, setRisultati] = useState<GruppoTragitti[] | null>(null);
  const [erroreAnalisi, setErroreAnalisi] = useState('');
  const [tragittiAnalizzati, setTragittiAnalizzati] = useState(0);
  const [postiPerBusGlobale, setPostiPerBusGlobale] = useState(50);
  const [sogliaOccupazionePercento, setSogliaOccupazionePercento] = useState(50);
  // Costo ipotetico di un bus combinato, digitato dall'utente per
  // ogni coppia candidata — deciso insieme: lo strumento propone,
  // non scrive né inventa un costo da solo (nessun preventivo vero
  // esiste ancora per un bus che non c'è).
  const [costoCombinatoMap, setCostoCombinatoMap] = useState<Map<number, number | undefined>>(new Map());

  useEffect(() => {
    eventiApi.list({ soloFuturi: true }).then(setEventi).catch(() => setEventi([]));
    impostazioniApi.list().then((righe) => {
      const posti = Number(righe.find((r) => r.chiave === 'posti_per_bus')?.valore);
      if (Number.isFinite(posti) && posti > 0) setPostiPerBusGlobale(posti);
      const soglia = Number(righe.find((r) => r.chiave === 'soglia_occupazione_pareggio')?.valore);
      if (Number.isFinite(soglia) && soglia > 0 && soglia <= 100) setSogliaOccupazionePercento(soglia);
    }).catch(() => {});
  }, []);

  async function analizza() {
    if (!eventoId) return;
    setAnalizzando(true);
    setErroreAnalisi('');
    setRisultati(null);
    setProgresso('Carico l\'evento...');
    try {
      const evento = await eventiApi.getById(eventoId);
      const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)]
        .filter((t) => t.attivo !== false);

      if (tuttiITragitti.length < 2) {
        setErroreAnalisi('Questo evento ha meno di due tragitti attivi — non c\'è nulla da confrontare.');
        return;
      }

      const anagrafica = await fermateAnagraficaApi.list();
      const mappaAnagrafica = new Map<string, FermataAnagrafica>(anagrafica.map((f) => [f.id, f]));

      const analisi: TragittoAnalisi[] = [];
      for (const t of tuttiITragitti) {
        const fermateAttive = t.fermate.filter((f) => f.attivo);
        let vendite: VenditePerFermata | null = null;
        try { vendite = await eventiApi.venditePerFermata(t.id); } catch { /* nessun permesso o nessuna prenotazione ancora — 0 ovunque, non blocca l'analisi */ }
        const fermateConCoord: FermataConCoordinate[] = [];
        for (const f of fermateAttive) {
          setProgresso(`Localizzo le fermate di "${t.nome}" (${fermateConCoord.length + 1}/${fermateAttive.length})...`);
          const daAnagrafica = f.fermataAnagraficaId ? mappaAnagrafica.get(f.fermataAnagraficaId) : null;
          let coord: Coordinate | null = daAnagrafica?.lat != null && daAnagrafica?.lng != null ? { lat: daAnagrafica.lat, lng: daAnagrafica.lng } : null;
          if (!coord && f.indirizzo?.trim()) {
            const r = await geocodifica(`${f.indirizzo}, ${f.citta}`);
            coord = r.coordinate;
          }
          const confermati = vendite?.perFermata.find((v) => v.citta === f.citta)?.confermati ?? 0;
          fermateConCoord.push({ id: f.id, citta: f.citta, orario: f.orario ?? null, coord, nonLocalizzata: !coord, prezzo: f.prezzo ? Number(f.prezzo) : null, confermati });
        }
        analisi.push({
          tragittoId: t.id, nome: t.nome,
          orarioPartenza: fermateAttive[0]?.orario ?? null,
          preventivoCosto: t.preventivoCosto ? Number(t.preventivoCosto) : null,
          fermate: fermateConCoord,
        });
        setTragittiAnalizzati((n) => n + 1);
      }

      // Prima ogni coppia compatibile (stesso identico calcolo di
      // prima — orario + fermate vicine), poi le raggruppo: se A è
      // vicino a B, e B è vicino a C, i tre finiscono nello STESSO
      // gruppo anche se A e C non sono direttamente vicini tra loro —
      // un bus che tocca prima A poi B poi C li serve comunque tutti
      // e tre in sequenza, non serve che ogni coppia sia vicina a ogni
      // altra ("unione degli insiemi collegati", non solo confronto a
      // due a due).
      const coppieTrovate: CoppiaTragitti[] = [];
      for (let i = 0; i < analisi.length; i++) {
        for (let j = i + 1; j < analisi.length; j++) {
          const a = analisi[i];
          const b = analisi[j];
          const minA = a.orarioPartenza ? minutiDa(a.orarioPartenza) : null;
          const minB = b.orarioPartenza ? minutiDa(b.orarioPartenza) : null;
          if (minA === null || minB === null) continue; // orario mancante su uno dei due: filtro decisivo, si scarta
          const differenzaMinuti = Math.abs(minA - minB);
          if (differenzaMinuti > finestraMinuti) continue;

          const coppieFermate: CoppiaVicina[] = [];
          for (const fa of a.fermate) {
            if (!fa.coord) continue;
            for (const fb of b.fermate) {
              if (!fb.coord) continue;
              const distanzaKm = distanzaLineaRetta(fa.coord, fb.coord);
              if (distanzaKm <= raggioKm) coppieFermate.push({ fermataA: fa, fermataB: fb, distanzaKm });
            }
          }
          if (coppieFermate.length > 0) {
            coppieFermate.sort((x, y) => x.distanzaKm - y.distanzaKm);
            coppieTrovate.push({ a, b, differenzaMinuti, coppieFermate });
          }
        }
      }

      // Unione degli insiemi (union-find) sugli indici dei tragitti —
      // ogni coppia compatibile trovata sopra "fonde" i due gruppi a
      // cui appartengono i suoi due tragitti.
      const genitore = analisi.map((_, i) => i);
      function trova(i: number): number { return genitore[i] === i ? i : (genitore[i] = trova(genitore[i])); }
      function unisci(i: number, j: number) { const ri = trova(i), rj = trova(j); if (ri !== rj) genitore[ri] = rj; }
      for (const c of coppieTrovate) unisci(analisi.indexOf(c.a), analisi.indexOf(c.b));

      const indiciPerRadice = new Map<number, number[]>();
      analisi.forEach((_, i) => {
        const r = trova(i);
        indiciPerRadice.set(r, [...(indiciPerRadice.get(r) ?? []), i]);
      });

      const gruppi: GruppoTragitti[] = [...indiciPerRadice.values()]
        .filter((indici) => indici.length > 1) // scarto i tragitti rimasti da soli, senza nessun collegamento
        .map((indici) => ({
          tragitti: indici.map((i) => analisi[i]),
          coppie: coppieTrovate.filter((c) => indici.includes(analisi.indexOf(c.a))),
        }));
      gruppi.sort((x, y) => y.tragitti.length - x.tragitti.length); // i gruppi più grandi (più tragitti insieme) prima
      setRisultati(gruppi);
    } catch (e) {
      setErroreAnalisi(e instanceof Error ? e.message : 'Analisi non riuscita — controlla la connessione e riprova.');
    } finally {
      setAnalizzando(false);
      setProgresso('');
      setTragittiAnalizzati(0);
    }
  }

  return (
    <div>
      <PanelHead
        titolo="Tragitti vicini (beta)"
        info="Strumento in prova — cerca, dentro un evento, coppie di tragitti con fermate vicine e orari di partenza compatibili: candidati papabili per un domani condividere un bus unico. Solo lettura, non modifica nulla."
      />

      <div className="section-card" style={{ maxWidth: 620, marginBottom: 20 }}>
        <div className="campo" style={{ marginBottom: 12 }}>
          <label>Evento</label>
          <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
            <option value="">— scegli un evento —</option>
            {eventi.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.artista} — {ev.citta}, {new Date(ev.data).toLocaleDateString('it-IT')}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="campo">
            <label>Raggio massimo tra le fermate (km)</label>
            <input type="number" min={1} value={raggioKm} onChange={(e) => setRaggioKm(Number(e.target.value) || 30)} />
          </div>
          <div className="campo">
            <label>Finestra oraria tollerata (minuti)</label>
            <input type="number" min={0} value={finestraMinuti} onChange={(e) => setFinestraMinuti(Number(e.target.value) || 90)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={analizza} disabled={!eventoId || analizzando}>
          {analizzando ? 'Analizzo...' : 'Analizza'}
        </button>
        {analizzando && progresso && (
          <p style={{ fontSize: 12.5, color: 'var(--mist)', marginTop: 8 }}>{progresso}{tragittiAnalizzati > 0 && ` (${tragittiAnalizzati} tragitti già analizzati)`}</p>
        )}
      </div>

      {erroreAnalisi && <p style={{ color: 'var(--pink)' }}>{erroreAnalisi}</p>}

      {risultati && risultati.length === 0 && (
        <p className="testo-intro">Nessun gruppo di tragitti trovato entro {raggioKm}km e {finestraMinuti} minuti di differenza sulla partenza.</p>
      )}

      {risultati && risultati.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {risultati.map((g, idx) => {
            const postiPareggio = Math.round(postiPerBusGlobale * (sogliaOccupazionePercento / 100));
            const tutteLeFermate = g.tragitti.flatMap((t) => t.fermate);
            const passeggeriCombinati = tutteLeFermate.reduce((s, f) => s + f.confermati, 0);
            const incassoCombinato = tutteLeFermate.reduce((s, f) => s + f.confermati * (f.prezzo ?? 0), 0);
            const costoCombinato = costoCombinatoMap.get(idx);
            const margineCombinato = costoCombinato != null ? incassoCombinato - costoCombinato : null;
            const tuttiHannoPreventivo = g.tragitti.every((t) => t.preventivoCosto != null);
            const costoSeparato = tuttiHannoPreventivo ? g.tragitti.reduce((s, t) => s + t.preventivoCosto!, 0) : null;
            const margineSeparato = costoSeparato != null ? incassoCombinato - costoSeparato : null;
            return (
            <div key={idx} className="section-card">
              <p style={{ fontWeight: 700, marginBottom: 4 }}>
                {g.tragitti.map((t, i) => (
                  <span key={t.tragittoId}>
                    {i > 0 && ' + '}
                    {t.nome} <span style={{ color: 'var(--mist)', fontWeight: 400 }}>({t.orarioPartenza})</span>
                  </span>
                ))}
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 10 }}>
                {g.tragitti.length} tragitti collegati · {g.coppie.reduce((s, c) => s + c.coppieFermate.length, 0)} coppia/e di fermate vicine trovate
              </p>
              {g.coppie.map((c, ci) => (
                <div key={ci} style={{ marginBottom: 8 }}>
                  {g.coppie.length > 1 && <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 2 }}>{c.a.nome} ↔ {c.b.nome} — partenze a {c.differenzaMinuti} minuti di distanza</p>}
                  {c.coppieFermate.map((cf, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i === c.coppieFermate.length - 1 ? 'none' : '1px solid var(--line)', fontSize: 13 }}>
                      <span>{cf.fermataA.citta} ↔ {cf.fermataB.citta}</span>
                      <span style={{ color: 'var(--mist)' }}>{cf.distanzaKm.toFixed(1)} km (linea d'aria)</span>
                    </div>
                  ))}
                </div>
              ))}

              <p className="section-label" style={{ marginTop: 16, marginBottom: 8 }}>Simula un bus unico per tutto il gruppo</p>
              <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 10 }}>
                Somma di TUTTE le fermate di tutti i {g.tragitti.length} tragitti insieme — un bus che copre l'intero giro di ognuno.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', marginBottom: 10, fontSize: 13 }}>
                <span>Passeggeri confermati: <strong>{passeggeriCombinati}</strong></span>
                <span>Posti di pareggio: <strong>{postiPareggio}</strong> <span style={{ color: 'var(--mist)' }}>(posti bus {postiPerBusGlobale} × soglia {sogliaOccupazionePercento}%)</span></span>
                <span style={{ color: passeggeriCombinati >= postiPareggio ? '#5be0a0' : 'var(--pink)' }}>
                  {passeggeriCombinati >= postiPareggio ? '✓ sopra la soglia di pareggio' : '⚠ ancora sotto la soglia di pareggio'}
                </span>
                {passeggeriCombinati > postiPerBusGlobale && (
                  <span style={{ color: '#f0b429' }}>⚠ supera i posti di un bus solo ({postiPerBusGlobale}) — potrebbero servirne due</span>
                )}
              </div>
              <div className="campo" style={{ maxWidth: 220, marginBottom: 10 }}>
                <label>Costo ipotetico bus unico (€)</label>
                <CampoNumero valuta value={costoCombinato} onChange={(v) => setCostoCombinatoMap((prev) => new Map(prev).set(idx, v))} />
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <p>Incasso totale (stesso, unito o separato — i prezzi per fermata non cambiano): <strong>€{incassoCombinato.toFixed(2)}</strong></p>
                {margineCombinato !== null && (
                  <p>Margine con bus unico: <strong style={{ color: margineCombinato >= 0 ? '#5be0a0' : 'var(--pink)' }}>€{margineCombinato.toFixed(2)}</strong></p>
                )}
                {margineSeparato !== null ? (
                  <p>Margine con {g.tragitti.length} bus separati (dai preventivi già registrati, €{g.tragitti.map((t) => t.preventivoCosto!.toFixed(0)).join(' + ')}): <strong style={{ color: margineSeparato >= 0 ? '#5be0a0' : 'var(--pink)' }}>€{margineSeparato.toFixed(2)}</strong></p>
                ) : (
                  <p style={{ color: 'var(--mist)' }}>Manca il preventivo su almeno un tragitto del gruppo — non posso confrontare col caso "bus separati".</p>
                )}
                {margineCombinato !== null && margineSeparato !== null && (
                  <p style={{ marginTop: 6, fontWeight: 700, color: margineCombinato > margineSeparato ? '#5be0a0' : 'var(--pink)' }}>
                    {margineCombinato > margineSeparato
                      ? `Conviene unire — margine migliore di €${(margineCombinato - margineSeparato).toFixed(2)}`
                      : `Conviene tenerli separati — margine migliore di €${(margineSeparato - margineCombinato).toFixed(2)}`}
                  </p>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
