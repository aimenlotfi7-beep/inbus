import { useEffect, useState } from 'react';
import { eventiApi, type CalcoloBusTragitto, type BusFisico, type BusFisicoInput, type RiepilogoEconomicoTratta } from '../../../api/eventi';
import { fornitoriApi, type Fornitore } from '../../../api/fornitori';
import { tourLeaderApi, type TourLeader } from '../../../api/tourleader';
import { ErroreApi } from '../../../api/client';
import { Modale } from '../../shared/Modale';
import { CampoNumero } from '../../shared/CampoNumero';
import { useSessione } from '../../shared/SessioneContext';
import { haPermesso } from '../../../api/auth';

const BUS_VUOTO: BusFisicoInput = { riferimento: '', tragittiIds: [] };

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
 *  urgente, ha sempre la precedenza), giallo se ha passeggeri ma manca
 *  ancora copertura sufficiente, verde se tutto ok. Con ZERO
 *  passeggeri confermati non c'è nessun avviso — è solo presto,
 *  nessuno ha ancora prenotato, non è un problema da segnalare come se
 *  qualcosa non andasse (prima mostrava "Non ancora coperta" anche
 *  qui, sembrava un avviso pur non essendoci davvero nulla da fare). */
function statoTragitto(tragitto: CalcoloBusTragitto) {
  const postiSuperati = tragitto.totalePasseggeri > tragitto.postiTotali;
  if (postiSuperati) return { classe: 'non-coperta', etichetta: `⚠ Posti superati di ${tragitto.totalePasseggeri - tragitto.postiTotali}` };
  if (tragitto.totalePasseggeri === 0) return { classe: 'neutro', etichetta: 'Nessuna prenotazione ancora' };
  if (!tragitto.coperta) return { classe: 'attenzione', etichetta: 'Non ancora coperta' };
  return { classe: 'coperta', etichetta: '✓ Coperta' };
}

/** Sezione "Partenze" di un singolo evento: riepilogo generale, calcolo
 *  bus necessari, copertura tratte, censimento bus fisici. Va dentro la
 *  scheda dell'evento (tab). */
export function PartenzeTab({ eventoId, servizi }: { eventoId: string; servizi?: { key: string; nome: string }[] }) {
  const sessione = useSessione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [economia, setEconomia] = useState<RiepilogoEconomicoTratta[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [tourLeaders, setTourLeaders] = useState<TourLeader[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [generandoLista, setGenerandoLista] = useState<string | null>(null);
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  // Se l'evento ha più servizi, questa sezione si comporta come se
  // ognuno fosse un evento a parte: una tab per servizio (più una per i
  // tragitti liberi, se ce ne sono).
  const [servizioAttivo, setServizioAttivo] = useState<string | 'liberi'>(servizi?.[0]?.key ?? 'liberi');

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
        setAperte((prev) => prev.size === 0 && c.length === 1 ? new Set([c[0].tragittoId]) : prev);
        // Il servizio scelto di default (il primo dell'elenco) potrebbe
        // non avere nessuna prenotazione — la sua tab, in quel caso, non
        // compare più (vedi sopra): sposto la selezione sul primo
        // servizio che ne ha davvero, altrimenti si vedrebbe "nessun
        // tragitto configurato" anche quando in realtà ce ne sono,
        // semplicemente non nel servizio selezionato di default.
        setServizioAttivo((attuale) => {
          const attualeHaPrenotazioni = attuale === 'liberi'
            ? c.some((l) => !l.servizioId && l.totalePasseggeri > 0)
            : c.some((l) => l.servizioId === attuale && l.totalePasseggeri > 0);
          if (attualeHaPrenotazioni) return attuale;
          const primoServizioConPrenotazioni = servizi?.find((v) => c.some((l) => l.servizioId === v.key && l.totalePasseggeri > 0));
          if (primoServizioConPrenotazioni) return primoServizioConPrenotazioni.key;
          if (c.some((l) => !l.servizioId && l.totalePasseggeri > 0)) return 'liberi';
          return attuale; // nessun servizio ha prenotazioni — resta così, comparirà il messaggio "nessun tragitto"
        });
      })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la sezione Partenze. Controlla i tuoi permessi o riprova.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fornitoriApi.list().then(setFornitori).catch(() => setFornitori([]));
    tourLeaderApi.list().then(setTourLeaders).catch(() => setTourLeaders([]));
  }, [eventoId]);

  function toggleApertura(tragittoId: string) {
    setAperte((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(tragittoId)) nuovo.delete(tragittoId); else nuovo.add(tragittoId);
      return nuovo;
    });
  }

  function apriNuovoBus(tragittoIdPreselezionato?: string) {
    setInModifica(null);
    setForm(tragittoIdPreselezionato ? { ...BUS_VUOTO, tragittiIds: [tragittoIdPreselezionato] } : BUS_VUOTO);
    setModaleAperta(true);
  }
  function apriModificaBus(b: BusFisico) {
    setInModifica(b);
    setForm({ fornitoreId: b.fornitoreId ?? undefined, riferimento: b.riferimento, autistaNome: b.autistaNome ?? undefined, autistaTelefono: b.autistaTelefono ?? undefined, tourLeaderId: b.tourLeaderId, costo: b.costo ? Number(b.costo) : undefined, postiBus: b.postiBus ?? undefined, note: b.note ?? undefined, tragittiIds: b.tragittiIds });
    setModaleAperta(true);
  }

  async function salvaBus() {
    if (!form.riferimento || form.tragittiIds.length === 0) {
      alert('Indica un riferimento per il bus e seleziona almeno un tragitto che copre.');
      return;
    }
    if (form.tourLeaderId) {
      const giaAssegnato = busLista.some((b) => b.tourLeaderId === form.tourLeaderId && b.id !== inModifica?.id);
      if (giaAssegnato) {
        alert('Questo tour leader è già assegnato a un altro bus di questo evento — un tour leader non può seguire due bus insieme.');
        return;
      }
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

  // Se ci sono servizi, questa sezione si comporta come se ognuno fosse
  // un evento a parte: filtro i tragitti mostrati secondo la tab scelta.
  const calcoloVisibile = (servizi && servizi.length > 0)
    ? calcolo.filter((l) => (servizioAttivo === 'liberi' ? !l.servizioId : l.servizioId === servizioAttivo))
    : calcolo;
  const trattoCoperteVisibili = calcoloVisibile.filter((l) => l.coperta).length;
  const trattoConProblemiVisibili = calcoloVisibile.filter((l) => l.totalePasseggeri > l.postiTotali).length;

  return (
    <div>
      {servizi && servizi.length > 0 && (
        <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {servizi
            // Un servizio senza nessuna prenotazione confermata su
            // nessuna delle sue tratte non ha ancora nulla da gestire
            // qui — stesso principio già applicato all'evento intero
            // nell'elenco di prima.
            .filter((v) => calcolo.some((l) => l.servizioId === v.key && l.totalePasseggeri > 0))
            .map((v) => {
            const nonCopertiQui = calcolo.filter((l) => l.servizioId === v.key && l.totalePasseggeri > 0 && !l.coperta).length;
            return (
              <button key={v.key} type="button" className={`mini-tab${servizioAttivo === v.key ? ' active' : ''}`} onClick={() => setServizioAttivo(v.key)}>
                {v.nome}
                {nonCopertiQui > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>
                    {nonCopertiQui}
                  </span>
                )}
              </button>
            );
          })}
          {calcolo.some((l) => !l.servizioId && l.totalePasseggeri > 0) && (() => {
            const nonCopertiLiberi = calcolo.filter((l) => !l.servizioId && l.totalePasseggeri > 0 && !l.coperta).length;
            return (
              <button type="button" className={`mini-tab${servizioAttivo === 'liberi' ? ' active' : ''}`} onClick={() => setServizioAttivo('liberi')}>
                Tragitti liberi
                {nonCopertiLiberi > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>
                    {nonCopertiLiberi}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {calcoloVisibile.length === 0 && (
        <p className="testo-intro">Questa scheda non ha ancora nessun tragitto configurato — vai nella tab "Dettagli" per aggiungerne uno.</p>
      )}

      {calcoloVisibile.length > 0 && (
        <div className="section-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
          <span className="chip">{calcoloVisibile.length} tragitt{calcoloVisibile.length === 1 ? 'o' : 'i'}</span>
          <span className="chip">{trattoCoperteVisibili}/{calcoloVisibile.length} coperte</span>
          <span className="chip">{busLista.length} bus censit{busLista.length === 1 ? 'o' : 'i'}</span>
          {trattoConProblemiVisibili > 0 && (
            <span className="badge non-coperta">⚠ {trattoConProblemiVisibili} tragitt{trattoConProblemiVisibili === 1 ? 'o' : 'i'} con posti superati</span>
          )}
        </div>
      )}

      {calcoloVisibile.map((tragitto) => {
        const stato = statoTragitto(tragitto);
        const busTragitto = busLista.filter((b) => b.tragittiIds.includes(tragitto.tragittoId));
        const espansa = aperte.has(tragitto.tragittoId);
        return (
        <div key={tragitto.tragittoId} className="section-card" style={stato.classe === 'non-coperta' ? { borderColor: 'var(--pink)' } : undefined}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
            onClick={() => toggleApertura(tragitto.tragittoId)}
          >
            <div>
              <h3>{espansa ? '▾' : '▸'} {tragitto.nome}</h3>
              <p className="section-sub">
                {tragitto.totalePasseggeri} passeggeri confermati su {tragitto.postiTotali} posti previsti · {busTragitto.length} bus censit{busTragitto.length === 1 ? 'o' : 'i'}
                {vedeEconomia && (() => {
                  const dati = economia.find((e) => e.tragittoId === tragitto.tragittoId);
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
                <strong>Bus suggeriti: {tragitto.busSuggeriti}</strong>
                <span style={{ color: 'var(--mist)' }}> — stima in base ai passeggeri per fermata; l'orario di ogni bus resta da compilare a mano.</span>
              </p>

              <p style={{ fontSize: 13, marginBottom: 12, color: 'var(--mist)' }}>
                {tragitto.postiBusCensiti > 0
                  ? <>Bus censiti: <strong style={{ color: 'var(--paper)' }}>{tragitto.postiBusCensiti} posti</strong> per {tragitto.totalePasseggeri} passeggeri confermati — la copertura si aggiorna da sola in base a quanto censisci qui sotto.</>
                  : 'Nessun bus con posti indicati ancora censito su questo tragitto — la copertura si aggiornerà da sola appena ne censisci uno.'}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                {tragitto.fermate.map((f) => (
                  <span key={f.fermataId} className="chip">{f.citta} <span className="chip-num">{f.passeggeri}</span></span>
                ))}
              </div>

              {(() => {
                const dati = economia.find((e) => e.tragittoId === tragitto.tragittoId);
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
                  <p className="section-label" style={{ marginBottom: 0 }}>Bus registrati su questo tragitto</p>
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={(e) => { e.stopPropagation(); apriNuovoBus(tragitto.tragittoId); }}>
                    + Censisci bus per questo tragitto
                  </button>
                </div>
                {busTragitto.map((b) => (
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
                {busTragitto.length === 0 && (
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
          <div className="campo"><label>Posti del bus (usato per calcolare da solo se la tratta è coperta)</label><CampoNumero min={0} value={form.postiBus} onChange={(v) => setForm({ ...form, postiBus: v })} /></div>
          <div className="campo"><label>Costo del bus (facoltativo — usato per calcolare il guadagno della tratta)</label><CampoNumero valuta min={0} value={form.costo} onChange={(v) => setForm({ ...form, costo: v })} /></div>
          <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>

          <p className="section-label" style={{ marginTop: 16 }}>Tragitto</p>
          <p className="testo-intro" style={{ marginTop: -6 }}>
            {calcolo.find((l) => l.tragittoId === form.tragittiIds[0])?.nome ?? '—'}
          </p>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={salvaBus}>Salva bus</button>
        </Modale>
      )}
    </div>
  );
}
