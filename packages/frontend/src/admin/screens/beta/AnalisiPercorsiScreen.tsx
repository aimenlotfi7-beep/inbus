import { useEffect, useState } from 'react';
import { eventiApi, type VenditePerFermata } from '../../../api/eventi';
import type { Evento } from '../../../api/types';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { impostazioniApi } from '../../../api/impostazioni';
import { geocodifica, durataViaggio, type Coordinate } from '../../shared/geo';
import { PanelHead } from '../../shared/PanelHead';
import { CampoNumero } from '../../shared/CampoNumero';
import { MappaPercorso, type PercorsoMappa } from '../../shared/MappaPercorso';

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

interface FermataNodo {
  id: string;
  tragittoId: string;
  tragittoNome: string;
  citta: string;
  orarioMinuti: number;
  coord: Coordinate;
  distanzaArrivo: number; // km in linea d'aria dalla fermata al SUO arrivo — serve per la linearità
  prezzo: number | null;
  confermati: number;
  preventivoCosto: number | null;
}

interface CollegamentoTratta { da: FermataNodo; a: FermataNodo; minutiGuida: number; minutiDisponibili: number; }
interface PercorsoCandidato { fermate: FermataNodo[]; collegamenti: CollegamentoTratta[]; }

/** Strumento in prova (progetto "Linee combinate" di cui abbiamo
 *  parlato) — SOLO lettura, nessuna scrittura su nulla: legge gli
 *  stessi dati già visibili in Partenze/Eventi, non li tocca, non è
 *  collegato a nessuna loro schermata.
 *
 *  Il parametro centrale è la SINGOLA FERMATA, non il tragitto intero
 *  (deciso insieme) — costruisce un percorso vero attraversando
 *  fermate di tragitti diversi, con questa regola: una fermata può
 *  seguirne un'altra SOLO SE il tempo di guida vero tra le due (dato
 *  reale OSRM, lo stesso già usato per "Calcola orari") è minore o
 *  uguale alla differenza tra i loro orari — così l'orario promesso a
 *  OGNI fermata resta esattamente quello, per nessun cliente cambia
 *  nulla. In più, il percorso deve restare LINEARE: ogni fermata deve
 *  essere più vicina al proprio arrivo di quella prima di lei (mai un
 *  passo indietro — lo stesso controllo di cui parlavamo per gli
 *  errori tipo "Lecce-Bari-Roma"). */
export function AnalisiPercorsiScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [tab, setTab] = useState<'elenco' | 'mappa'>('elenco');
  const [eventoId, setEventoId] = useState('');
  const [analizzando, setAnalizzando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [percorsi, setPercorsi] = useState<PercorsoCandidato[] | null>(null);
  const [erroreAnalisi, setErroreAnalisi] = useState('');
  const [postiPerBusGlobale, setPostiPerBusGlobale] = useState(50);
  const [sogliaOccupazionePercento, setSogliaOccupazionePercento] = useState(50);
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
    setPercorsi(null);
    setCostoCombinatoMap(new Map());
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

      async function localizza(indirizzo: string, citta: string, fermataAnagraficaId?: string | null): Promise<Coordinate | null> {
        const daAnagrafica = fermataAnagraficaId ? mappaAnagrafica.get(fermataAnagraficaId) : null;
        if (daAnagrafica?.lat != null && daAnagrafica?.lng != null) return { lat: daAnagrafica.lat, lng: daAnagrafica.lng };
        if (!indirizzo?.trim()) return null;
        const r = await geocodifica(`${indirizzo}, ${citta}`);
        return r.coordinate;
      }

      // Fase 1 — costruisco tutti i nodi (una fermata = un nodo), con
      // coordinate, distanza dal proprio arrivo, prezzo e prenotazioni
      // vere già confermate.
      const nodi: FermataNodo[] = [];
      for (const t of tuttiITragitti) {
        if (!t.arrivoIndirizzo?.trim() && !t.arrivoCitta?.trim()) continue; // niente arrivo, non calcolabile: tragitto saltato
        setProgresso(`Localizzo l'arrivo di "${t.nome}"...`);
        const coordArrivo = await localizza(t.arrivoIndirizzo ?? '', t.arrivoCitta ?? '', null);
        if (!coordArrivo) continue;

        let vendite: VenditePerFermata | null = null;
        try { vendite = await eventiApi.venditePerFermata(t.id); } catch { /* nessuna prenotazione ancora o permesso mancante — 0 ovunque, non blocca */ }

        const fermateAttive = t.fermate.filter((f) => f.attivo);
        for (const f of fermateAttive) {
          setProgresso(`Localizzo le fermate di "${t.nome}" (${nodi.length + 1} finora)...`);
          if (!f.orario) continue; // senza orario non si può verificare la compatibilità: fermata scartata
          const orarioMinuti = minutiDa(f.orario);
          if (orarioMinuti === null) continue;
          const coord = await localizza(f.indirizzo ?? '', f.citta, f.fermataAnagraficaId);
          if (!coord) continue;
          nodi.push({
            id: f.id, tragittoId: t.id, tragittoNome: t.nome, citta: f.citta,
            orarioMinuti, coord, distanzaArrivo: distanzaLineaRetta(coord, coordArrivo),
            prezzo: f.prezzo ? Number(f.prezzo) : null,
            confermati: vendite?.perFermata.find((v) => v.citta === f.citta)?.confermati ?? 0,
            preventivoCosto: t.preventivoCosto ? Number(t.preventivoCosto) : null,
          });
        }
      }

      if (nodi.length < 2) {
        setErroreAnalisi('Non ci sono abbastanza fermate localizzabili (con orario e indirizzo validi) da confrontare.');
        return;
      }

      // Fase 2 — costruzione dei percorsi: in ordine di orario
      // (prima chi parte prima), ogni fermata si aggiunge alla fine di
      // un percorso già in costruzione SOLO se sia il tempo di guida
      // vero (OSRM) sia la linearità tornano; altrimenti apre un
      // percorso nuovo. Fermate dello STESSO tragitto non si
      // aggiungono mai una all'altra (sono già collegate per
      // definizione, non è quello che stiamo cercando).
      const inOrdine = [...nodi].sort((a, b) => a.orarioMinuti - b.orarioMinuti);
      const percorsiInCostruzione: PercorsoCandidato[] = [];
      let contatoreGuida = 0;

      for (const nodo of inOrdine) {
        let aggiunto = false;
        for (const percorso of percorsiInCostruzione) {
          const coda = percorso.fermate[percorso.fermate.length - 1];
          if (coda.tragittoId === nodo.tragittoId) continue; // stesso tragitto, non è un collegamento nuovo
          if (nodo.distanzaArrivo >= coda.distanzaArrivo) continue; // non più vicino dell'ultima — romperebbe la linearità
          const minutiDisponibili = nodo.orarioMinuti - coda.orarioMinuti;
          if (minutiDisponibili <= 0) continue; // stesso ordine di orario già garantito dal ciclo, ma per sicurezza

          setProgresso(`Verifico il tempo di guida reale (${++contatoreGuida})...`);
          const minutiGuida = await durataViaggio(coda.coord, nodo.coord);
          if (minutiGuida !== null && minutiGuida <= minutiDisponibili) {
            percorso.fermate.push(nodo);
            percorso.collegamenti.push({ da: coda, a: nodo, minutiGuida, minutiDisponibili });
            aggiunto = true;
            break;
          }
        }
        if (!aggiunto) percorsiInCostruzione.push({ fermate: [nodo], collegamenti: [] });
      }

      // Solo i percorsi che toccano DAVVERO più di un tragitto sono
      // interessanti — uno con fermate di un solo tragitto è
      // semplicemente il tragitto così com'è già, niente di nuovo da
      // proporre.
      const risultato = percorsiInCostruzione
        .filter((p) => new Set(p.fermate.map((f) => f.tragittoId)).size > 1)
        .sort((a, b) => b.fermate.length - a.fermate.length);
      setPercorsi(risultato);
    } catch (e) {
      setErroreAnalisi(e instanceof Error ? e.message : 'Analisi non riuscita — controlla la connessione e riprova.');
    } finally {
      setAnalizzando(false);
      setProgresso('');
    }
  }

  return (
    <div>
      <PanelHead
        titolo="Percorso combinato (beta)"
        info="Strumento in prova — costruisce un percorso attraverso le fermate di più tragitti dello stesso evento, garantendo che l'orario promesso a ognuna resti esattamente quello (tempo di guida reale entro la differenza tra gli orari) e che il percorso sia sempre lineare, mai un passo indietro. Solo lettura, non modifica nulla."
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
        <button className="btn btn-primary" onClick={analizza} disabled={!eventoId || analizzando}>
          {analizzando ? 'Analizzo...' : 'Costruisci percorsi'}
        </button>
        {analizzando && progresso && (
          <p style={{ fontSize: 12.5, color: 'var(--mist)', marginTop: 8 }}>{progresso}</p>
        )}
        <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 10 }}>
          Ogni coppia di fermate candidate richiede una verifica sul tempo di guida vero — con molte fermate insieme
          può richiedere qualche decina di secondi, non è istantaneo.
        </p>
      </div>

      {erroreAnalisi && <p style={{ color: 'var(--pink)' }}>{erroreAnalisi}</p>}

      {percorsi && percorsi.length > 0 && (
        <div className="mini-tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={`mini-tab${tab === 'elenco' ? ' active' : ''}`} onClick={() => setTab('elenco')}>Elenco</button>
          <button type="button" className={`mini-tab${tab === 'mappa' ? ' active' : ''}`} onClick={() => setTab('mappa')}>Mappa</button>
        </div>
      )}

      {tab === 'mappa' && percorsi && percorsi.length > 0 && (
        <MappaPercorso
          percorsi={percorsi.map((p, idx): PercorsoMappa => ({
            id: String(idx),
            nome: `Percorso ${idx + 1} (${p.fermate.length} fermate, ${new Set(p.fermate.map((f) => f.tragittoId)).size} tragitti)`,
            tappe: p.fermate.map((f) => ({
              etichetta: `${f.citta} (${f.tragittoNome})`,
              citta: f.citta,
              // Le coordinate le abbiamo già (calcolate durante
              // l'analisi) — passate dirette, niente da geocodificare
              // di nuovo.
              lat: f.coord.lat,
              lng: f.coord.lng,
            })),
          }))}
        />
      )}

      {tab === 'elenco' && (
      <>
      {percorsi && percorsi.length === 0 && (
        <p className="testo-intro">Nessun percorso combinato possibile trovato — nessuna fermata di tragitti diversi rispetta sia il tempo di guida reale sia la linearità.</p>
      )}

      {percorsi && percorsi.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {percorsi.map((p, idx) => {
            const postiPareggio = Math.round(postiPerBusGlobale * (sogliaOccupazionePercento / 100));
            const passeggeriTotali = p.fermate.reduce((s, f) => s + f.confermati, 0);
            const incassoTotale = p.fermate.reduce((s, f) => s + f.confermati * (f.prezzo ?? 0), 0);
            const costoCombinato = costoCombinatoMap.get(idx);
            const margineCombinato = costoCombinato != null ? incassoTotale - costoCombinato : null;
            const tragittiCoinvolti = [...new Map(p.fermate.map((f) => [f.tragittoId, f])).values()];
            const tuttiHannoPreventivo = tragittiCoinvolti.every((f) => f.preventivoCosto != null);
            const costoSeparato = tuttiHannoPreventivo ? tragittiCoinvolti.reduce((s, f) => s + f.preventivoCosto!, 0) : null;
            const margineSeparato = costoSeparato != null ? incassoTotale - costoSeparato : null;
            return (
              <div key={idx} className="section-card">
                <p style={{ fontWeight: 700, marginBottom: 4 }}>
                  Percorso di {p.fermate.length} fermate, da {tragittiCoinvolti.length} tragitti diversi
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 10 }}>
                  {p.fermate.map((f) => `${f.citta} (${f.tragittoNome})`).join(' → ')}
                </p>
                {p.collegamenti.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i === p.collegamenti.length - 1 ? 'none' : '1px solid var(--line)', fontSize: 13 }}>
                    <span>{c.da.citta} → {c.a.citta}</span>
                    <span style={{ color: 'var(--mist)' }}>{c.minutiGuida} min di guida, {c.minutiDisponibili} min disponibili</span>
                  </div>
                ))}

                <p className="section-label" style={{ marginTop: 16, marginBottom: 8 }}>Simula questo percorso come un bus unico</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', marginBottom: 10, fontSize: 13 }}>
                  <span>Passeggeri confermati: <strong>{passeggeriTotali}</strong></span>
                  <span>Posti di pareggio: <strong>{postiPareggio}</strong> <span style={{ color: 'var(--mist)' }}>(posti bus {postiPerBusGlobale} × soglia {sogliaOccupazionePercento}%)</span></span>
                  <span style={{ color: passeggeriTotali >= postiPareggio ? '#5be0a0' : 'var(--pink)' }}>
                    {passeggeriTotali >= postiPareggio ? '✓ sopra la soglia di pareggio' : '⚠ ancora sotto la soglia di pareggio'}
                  </span>
                  {passeggeriTotali > postiPerBusGlobale && (
                    <span style={{ color: '#f0b429' }}>⚠ supera i posti di un bus solo ({postiPerBusGlobale})</span>
                  )}
                </div>
                <div className="campo" style={{ maxWidth: 220, marginBottom: 10 }}>
                  <label>Costo ipotetico bus unico (€)</label>
                  <CampoNumero valuta value={costoCombinato} onChange={(v) => setCostoCombinatoMap((prev) => new Map(prev).set(idx, v))} />
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <p>Incasso totale (i prezzi per fermata non cambiano, uniti o separati): <strong>€{incassoTotale.toFixed(2)}</strong></p>
                  {margineCombinato !== null && (
                    <p>Margine con bus unico: <strong style={{ color: margineCombinato >= 0 ? '#5be0a0' : 'var(--pink)' }}>€{margineCombinato.toFixed(2)}</strong></p>
                  )}
                  {margineSeparato !== null ? (
                    <p>Margine con {tragittiCoinvolti.length} bus separati (dai preventivi già registrati): <strong style={{ color: margineSeparato >= 0 ? '#5be0a0' : 'var(--pink)' }}>€{margineSeparato.toFixed(2)}</strong></p>
                  ) : (
                    <p style={{ color: 'var(--mist)' }}>Manca il preventivo su almeno un tragitto coinvolto — non posso confrontare col caso "bus separati".</p>
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
      </>
      )}
    </div>
  );
}
