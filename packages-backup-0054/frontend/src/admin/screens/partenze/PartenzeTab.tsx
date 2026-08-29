import { useEffect, useState } from 'react';
import { eventiApi, type CalcoloBusLinea, type BusFisico, type BusFisicoInput, type RiepilogoEconomicoTratta } from '../../../api/eventi';
import { fornitoriApi, type Fornitore } from '../../../api/fornitori';
import { tourLeaderApi, type TourLeader } from '../../../api/tourleader';
import { ErroreApi } from '../../../api/client';
import { Modale } from '../../shared/Modale';
import { useSessione } from '../../shared/SessioneContext';
import { haPermesso } from '../../../api/auth';

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

/** Un solo indicatore di stato per tratta (invece di due badge separati
 *  che si accavallavano): rosso se ha posti superati (il problema più
 *  urgente, ha sempre la precedenza), giallo se manca ancora la
 *  copertura, verde se tutto ok. */
function statoTratta(linea: CalcoloBusLinea) {
  const postiSuperati = linea.totalePasseggeri > linea.postiTotali;
  if (postiSuperati) return { classe: 'non-coperta', etichetta: `⚠ Posti superati di ${linea.totalePasseggeri - linea.postiTotali}` };
  if (!linea.coperta) return { classe: 'attenzione', etichetta: 'Non ancora coperta' };
  return { classe: 'coperta', etichetta: '✓ Coperta' };
}

/** Sezione "Partenze" di un singolo evento: riepilogo generale, calcolo
 *  bus necessari, copertura tratte, censimento bus fisici. Va dentro la
 *  scheda dell'evento (tab). */
export function PartenzeTab({ eventoId }: { eventoId: string }) {
  const sessione = useSessione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
  const [calcolo, setCalcolo] = useState<CalcoloBusLinea[]>([]);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [economia, setEconomia] = useState<RiepilogoEconomicoTratta[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [generandoLista, setGenerandoLista] = useState<string | null>(null);
  const [aperte, setAperte] = useState<Set<string>>(new Set());

  const [inModifica, setInModifica] = useState<BusFisico | null>(null);
  const [form, setForm] = useState<BusFisicoInput>(BUS_VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() {
    setCaricamento(true);
    setErrore('');
    Promise.all([
      eventiApi.calcolaBus(eventoId),
      eventiApi.listaBus(eventoId),
      vedeEconomia ? eventiApi.riepilogoEconomico(eventoId) : Promise.resolve([]),
    ])
      .then(([c, b, e]) => {
        setCalcolo(c);
        setBusLista(b);
        setEconomia(e);
        // Se c'è una sola tratta, tanto vale aprirla subito — altrimenti
        // partono tutte chiuse, per non dover scorrere un elenco lungo.
        setAperte((prev) => prev.size === 0 && c.length === 1 ? new Set([c[0].lineaId]) : prev);
      })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la sezione Partenze. Controlla i tuoi permessi o riprova.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    tourLeaderApi.list().then(setTourLeaders).catch(() => setTourLeaders([]));
  }, [eventoId]);

  function toggleApertura(lineaId: string) {
    setAperte((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(lineaId)) nuovo.delete(lineaId); else nuovo.add(lineaId);
      return nuovo;
    });
  }

  async function toggleCopertura(linea: CalcoloBusLinea) {
    try {
      await eventiApi.impostaCopertura(eventoId, linea.lineaId, !linea.coperta);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  function apriNuovoBus(lineaIdPreselezionata?: string) {
    setInModifica(null);
    setForm(lineaIdPreselezionata ? { ...BUS_VUOTO, lineeIds: [lineaIdPreselezionata] } : BUS_VUOTO);
    setModaleAperta(true);
  }
  function apriModificaBus(b: BusFisico) {
    setInModifica(b);
    setForm({ fornitoreId: b.fornitoreId ?? undefined, riferimento: b.riferimento, autistaNome: b.autistaNome ?? undefined, autistaTelefono: b.autistaTelefono ?? undefined, tourLeaderId: b.tourLeaderId, costo: b.costo ? Number(b.costo) : undefined, note: b.note ?? undefined, lineeIds: b.lineeIds });
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

  const trattoCoperte = calcolo.filter((l) => l.coperta).length;
  const trattoConProblemi = calcolo.filter((l) => l.totalePasseggeri > l.postiTotali).length;

  return (
    <div>
      {calcolo.length === 0 && (
        <p className="testo-intro">Questa scheda non ha ancora nessuna tratta configurata — vai nella tab "Dettagli" per aggiungerne una.</p>
      )}

      {calcolo.length > 0 && (
        <div className="section-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
          <span className="chip">{calcolo.length} tratt{calcolo.length === 1 ? 'a' : 'e'}</span>
          <span className="chip">{trattoCoperte}/{calcolo.length} coperte</span>
          <span className="chip">{busLista.length} bus censit{busLista.length === 1 ? 'o' : 'i'}</span>
          {trattoConProblemi > 0 && (
            <span className="badge non-coperta">⚠ {trattoConProblemi} tratt{trattoConProblemi === 1 ? 'a' : 'e'} con posti superati</span>
          )}
        </div>
      )}

      {calcolo.map((linea) => {
        const stato = statoTratta(linea);
        const busTratta = busLista.filter((b) => b.lineeIds.includes(linea.lineaId));
        const espansa = aperte.has(linea.lineaId);
        return (
        <div key={linea.lineaId} className="section-card" style={stato.classe === 'non-coperta' ? { borderColor: 'var(--pink)' } : undefined}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
            onClick={() => toggleApertura(linea.lineaId)}
          >
            <div>
              <h3>{espansa ? '▾' : '▸'} {linea.nome}</h3>
              <p className="section-sub">
                {linea.totalePasseggeri} passeggeri confermati su {linea.postiTotali} posti previsti · {busTratta.length} bus censit{busTratta.length === 1 ? 'o' : 'i'}
                {vedeEconomia && (() => {
                  const dati = economia.find((e) => e.lineaId === linea.lineaId);
                  if (!dati) return null;
                  return (
                    <>
                      {' · '}
                      <span style={{ color: '#5be0a0' }}>€{dati.incassato.toFixed(2)}</span>
                      {dati.costoCensito && (
                        <> {' · '}<span style={{ color: dati.guadagno >= 0 ? '#5be0a0' : 'var(--pink)' }}>€{dati.guadagno.toFixed(2)}</span></>
                      )}
                    </>
                  );
                })()}
              </p>
            </div>
            <span className={`badge ${stato.classe}`} style={{ flexShrink: 0 }}>{stato.etichetta}</span>
          </div>

          {espansa && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                <strong>Bus suggeriti: {linea.busSuggeriti}</strong>
                <span style={{ color: 'var(--mist)' }}> — stima in base ai passeggeri per fermata; l'orario di ogni bus resta da compilare a mano.</span>
              </p>

              <button
                type="button"
                className={`badge badge-btn ${linea.coperta ? 'coperta' : 'non-coperta'}`}
                style={{ marginBottom: 12 }}
                onClick={(e) => { e.stopPropagation(); toggleCopertura(linea); }}
              >
                {linea.coperta ? '✓ Segnata come coperta — clicca per togliere' : 'Segna come coperta'}
              </button>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                {linea.fermate.map((f) => (
                  <span key={f.fermataId} className="chip">{f.citta} <span className="chip-num">{f.passeggeri}</span></span>
                ))}
              </div>

              {(() => {
                const dati = economia.find((e) => e.lineaId === linea.lineaId);
                if (!dati) return null;
                return (
                  <div className="section-divider" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <p className="section-label" style={{ marginBottom: 4 }}>Incassato</p>
                      <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, color: '#5be0a0' }}>€{dati.incassato.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="section-label" style={{ marginBottom: 4 }}>Costo bus</p>
                      <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 16 }}>
                        {dati.costoCensito ? `€${dati.costo.toFixed(2)}` : <span style={{ color: 'var(--mist)' }}>non censito</span>}
                      </p>
                    </div>
                    <div>
                      <p className="section-label" style={{ marginBottom: 4 }}>Guadagno</p>
                      <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, color: dati.costoCensito ? (dati.guadagno >= 0 ? '#5be0a0' : 'var(--pink)') : 'var(--mist)' }}>
                        {dati.costoCensito ? `€${dati.guadagno.toFixed(2)}` : '—'}
                      </p>
                      {!dati.costoCensito && (
                        <p className="testo-intro" style={{ fontSize: 11, marginTop: 2 }}>Compila il costo su almeno un bus per calcolarlo</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="section-divider">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                  <p className="section-label" style={{ marginBottom: 0 }}>Bus registrati su questa tratta</p>
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={(e) => { e.stopPropagation(); apriNuovoBus(linea.lineaId); }}>
                    + Censisci bus per questa tratta
                  </button>
                </div>
                {busTratta.map((b) => (
                  <div key={b.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                    <span className="riga-titolo">
                      {b.riferimento}{b.autistaNome ? ` — ${b.autistaNome}` : ''}
                      {b.tourLeaderNome && <><br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>Tour leader: {b.tourLeaderNome}</span></>}
                    </span>
                    <span className="riga-meta">
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => generaLista(b)} disabled={generandoLista === b.id}>
                        {generandoLista === b.id ? 'Genero...' : '⤓ Genera lista'}
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => apriModificaBus(b)}>Modifica</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px', color: 'var(--pink)' }} onClick={() => rimuoviBus(b)}>Rimuovi</button>
                    </span>
                  </div>
                ))}
                {busTratta.length === 0 && (
                  <p className="testo-intro" style={{ marginBottom: 0, fontSize: 13 }}>Nessun bus ancora censito per questa tratta.</p>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })}

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
          <div className="campo"><label>Costo del bus (€, facoltativo — usato per calcolare il guadagno della tratta)</label><input type="number" min={0} value={form.costo ?? ''} onChange={(e) => setForm({ ...form, costo: e.target.value ? Number(e.target.value) : undefined })} /></div>
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
