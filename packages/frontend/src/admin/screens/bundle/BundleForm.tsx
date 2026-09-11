import { useEffect, useState } from 'react';
import { bundleApi, type BundleInput, type EventoDelBundle, ETICHETTA_STATO_BUNDLE, formattaDataOraIt } from '../../../api/bundle';
import { organizzatoriApi, type Organizzatore } from '../../../api/organizzatori';
import { ErroreApi } from '../../../api/client';
import { notifica } from '../../shared/notifiche';
import { PaginaSezione } from '../../shared/PaginaSezione';
import { CampoNumero } from '../../shared/CampoNumero';
import { CaricaFile } from '../../shared/CaricaFile';
import { SelettoreEventi } from '../../shared/SelettoreEventi';

const VUOTO: BundleInput = {
  nome: '', descrizione: '', copertinaUrl: null, tipo: 'FISSO', eventiIds: [],
  minEventi: null, maxEventi: null, minPosti: 1, maxPosti: 10, scontoPercentuale: 10,
  ammetteOfferte: false, ammetteCredito: false, ammettePromoter: false, ammetteAcconto: false,
  inizioVendita: null, fineVendita: null, visibileSeProgrammato: true, visibileSeTerminato: false,
  attivo: true, inEvidenzaHome: false, organizzatoreId: null,
};

// Stesso schema del wizard di creazione evento: 5 passi divisi per tema
// e priorità — prima l'identità del bundle, poi la sua struttura
// (obbligatoria per venderlo), poi le regole commerciali, poi quando
// venderlo, infine un riepilogo. In creazione si procede in ordine
// (il passo prima deve essere completo); in modifica sono tab libere,
// come per l'evento — i dati esistono già tutti.
const STEP_WIZARD = [
  { numero: 1, label: 'Informazioni' },
  { numero: 2, label: 'Tipo ed eventi' },
  { numero: 3, label: 'Regole' },
  { numero: 4, label: 'Vendita' },
  { numero: 5, label: 'Riepilogo' },
] as const;
type NumeroStep = typeof STEP_WIZARD[number]['numero'];

/** datetime-local vuole "YYYY-MM-DDTHH:mm" nell'ora LOCALE del browser;
 *  il server salva l'istante. Chi usa il gestionale è in Italia, quindi
 *  quello che scrive è ora italiana — e viene mostrato tale. */
function aLocale(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function daLocale(v: string): string | null { return v ? new Date(v).toISOString() : null; }

export function BundleForm({ bundleId, onChiudi }: { bundleId: string | null; onChiudi: () => void }) {
  const [form, setForm] = useState<BundleInput>(VUOTO);
  const [eventiDettaglio, setEventiDettaglio] = useState<EventoDelBundle[]>([]);
  const [statoAttuale, setStatoAttuale] = useState<string | null>(null);
  const [organizzatori, setOrganizzatori] = useState<Organizzatore[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [step, setStep] = useState<NumeroStep>(1);
  const agg = (patch: Partial<BundleInput>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    organizzatoriApi.list().then(setOrganizzatori).catch(() => setOrganizzatori([]));
    if (!bundleId) return;
    bundleApi.dettaglio(bundleId).then((b) => {
      setForm({
        nome: b.nome, slug: b.slug, descrizione: b.descrizione ?? '', copertinaUrl: b.copertinaUrl ?? null, tipo: b.tipo,
        eventiIds: b.eventi.map((e) => e.id), minEventi: b.minEventi, maxEventi: b.maxEventi, minPosti: b.minPosti, maxPosti: b.maxPosti,
        scontoPercentuale: Number(b.scontoPercentuale),
        ammetteOfferte: b.ammetteOfferte, ammetteCredito: b.ammetteCredito, ammettePromoter: b.ammettePromoter, ammetteAcconto: b.ammetteAcconto,
        inizioVendita: b.inizioVendita ?? null, fineVendita: b.fineVendita ?? null,
        visibileSeProgrammato: b.visibileSeProgrammato, visibileSeTerminato: b.visibileSeTerminato,
        attivo: b.attivo, inEvidenzaHome: b.inEvidenzaHome, organizzatoreId: b.organizzatoreId,
      });
      setEventiDettaglio(b.eventi);
      setStatoAttuale(ETICHETTA_STATO_BUNDLE[b.stato]);
    }).catch(() => notifica('Bundle non trovato.'));
  }, [bundleId]);

  // Completamento vero di ogni passo — non "ci sono passato sopra", ma
  // "ho scritto quello che serve" — stessa logica del wizard evento.
  const infoCompleta = form.nome.trim().length > 0;
  const eventiValidi = form.eventiIds.length > 0 && (form.tipo === 'FISSO' || (
    (form.minEventi ?? 0) >= 1 && (form.minEventi ?? 0) <= form.eventiIds.length &&
    (form.maxEventi == null || (form.maxEventi >= (form.minEventi ?? 1) && form.maxEventi <= form.eventiIds.length))
  ));
  const regoleValide = form.scontoPercentuale > 0 && form.scontoPercentuale < 100 && form.maxPosti >= form.minPosti;
  const venditaValida = !form.inizioVendita || !form.fineVendita || new Date(form.fineVendita).getTime() > new Date(form.inizioVendita).getTime();
  const stepCompleto: Record<NumeroStep, boolean> = {
    1: infoCompleta, 2: eventiValidi, 3: regoleValide, 4: venditaValida, 5: false,
  };
  const MESSAGGIO_PASSO: Record<NumeroStep, string> = {
    1: 'Inserisci il nome del bundle prima di proseguire.',
    2: form.tipo === 'FISSO' ? 'Scegli almeno un evento prima di proseguire.' : 'Scegli gli eventi disponibili e imposta un minimo coerente (non superiore al numero di eventi) prima di proseguire.',
    3: 'Imposta uno sconto tra 1 e 99% e passeggeri massimi non inferiori ai minimi.',
    4: 'La fine vendita deve essere dopo l\'inizio.',
    5: '',
  };

  async function salva() {
    if (salvando) return;
    setSalvando(true);
    try {
      if (bundleId) await bundleApi.update(bundleId, form); else await bundleApi.create(form);
      notifica('Bundle salvato.', 'successo');
      onChiudi();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally { setSalvando(false); }
  }

  const nonVendibili = eventiDettaglio.filter((e) => form.eventiIds.includes(e.id) && (!e.vendibile || e.eliminato));

  const contenutoStep: Record<NumeroStep, React.ReactNode> = {
    1: <BundleInfo form={form} agg={agg} />,
    2: <BundleEventi form={form} agg={agg} nonVendibili={nonVendibili} />,
    3: <BundleRegole form={form} agg={agg} />,
    4: <BundleVendita form={form} agg={agg} organizzatori={organizzatori} />,
    5: <BundleRiepilogo form={form} />,
  };

  // ---- Vista MODIFICA: tab libere (i dati esistono già, si naviga soltanto) ----
  if (bundleId) {
    return (
      <PaginaSezione titolo="Modifica bundle" onIndietro={onChiudi} larga
        azioni={<button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva bundle'}</button>}>
        {statoAttuale && <p className="testo-intro" style={{ marginBottom: 12 }}>Stato attuale: <b>{statoAttuale}</b> (calcolato da date e attivazione, non si imposta a mano).</p>}
        <div className="mini-tabs">
          {STEP_WIZARD.map((s) => (
            <button key={s.numero} type="button" className={`mini-tab${step === s.numero ? ' active' : ''}`} onClick={() => setStep(s.numero)}>{s.label}</button>
          ))}
        </div>
        {contenutoStep[step]}
      </PaginaSezione>
    );
  }

  // ---- Vista CREAZIONE: wizard a step, in ordine obbligato ----
  return (
    <PaginaSezione titolo="Nuovo bundle" onIndietro={onChiudi} larga>
      <div className="mini-tabs">
        {STEP_WIZARD.map((s) => (
          <button
            key={s.numero}
            type="button"
            className={`mini-tab${step === s.numero ? ' active' : stepCompleto[s.numero] ? ' completato' : ''}`}
            // Si può tornare indietro liberamente, ma non saltare avanti
            // oltre il primo passo non ancora completo — stessa regola
            // del wizard evento.
            disabled={s.numero > step && !STEP_WIZARD.slice(0, s.numero - 1).every((p) => stepCompleto[p.numero])}
            onClick={() => setStep(s.numero)}
          >
            {stepCompleto[s.numero] && step !== s.numero && '✓ '}{s.label}
          </button>
        ))}
      </div>

      {contenutoStep[step]}

      <div className="wizard-nav">
        <button className="btn btn-ghost" disabled={step === 1} onClick={() => setStep((s) => (s > 1 ? ((s - 1) as NumeroStep) : s))}>← Passo precedente</button>
        {step < 5 ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!stepCompleto[step]) { notifica(MESSAGGIO_PASSO[step]); return; }
              setStep((s) => (s + 1) as NumeroStep);
            }}
          >
            Avanti →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Creo...' : 'Crea bundle'}</button>
        )}
      </div>
    </PaginaSezione>
  );
}

function BundleInfo({ form, agg }: { form: BundleInput; agg: (p: Partial<BundleInput>) => void }) {
  // Copertina in due modi, come le immagini evento: carica un file
  // oppure incolla direttamente un link (es. un'immagine già online).
  const [linkCopertina, setLinkCopertina] = useState('');
  function aggiungiDaLink() {
    if (!linkCopertina.trim()) return;
    agg({ copertinaUrl: linkCopertina.trim() });
    setLinkCopertina('');
  }
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <p className="section-label">Informazioni</p>
      <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => agg({ nome: e.target.value })} placeholder="es. Rassegna Estate 2027" /></div>
      <div className="campo"><label>Descrizione</label><textarea rows={4} value={form.descrizione ?? ''} onChange={(e) => agg({ descrizione: e.target.value })} /></div>
      <div className="campo">
        <label>Copertina (propria del bundle, non di un evento)</label>
        {form.copertinaUrl && <img src={form.copertinaUrl} alt="" style={{ maxWidth: 240, borderRadius: 8, display: 'block', marginBottom: 8 }} />}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="https://... (o carica un file)" value={linkCopertina} onChange={(e) => setLinkCopertina(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={aggiungiDaLink}>+ Aggiungi</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CaricaFile onCaricato={(url) => agg({ copertinaUrl: url })} etichetta="+ Carica copertina" />
          {form.copertinaUrl && <button type="button" className="btn btn-ghost" onClick={() => agg({ copertinaUrl: null })}>Rimuovi</button>}
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.inEvidenzaHome} onChange={(e) => agg({ inEvidenzaHome: e.target.checked })} style={{ width: 'auto' }} />
        In evidenza nella home del sito
      </label>
    </div>
  );
}

function BundleEventi({ form, agg, nonVendibili }: { form: BundleInput; agg: (p: Partial<BundleInput>) => void; nonVendibili: EventoDelBundle[] }) {
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <p className="section-label">Tipo ed eventi</p>
      <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={form.tipo === 'FISSO'} onChange={() => agg({ tipo: 'FISSO', minEventi: null, maxEventi: null })} style={{ width: 'auto' }} /> Fisso — il cliente li prende tutti</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={form.tipo === 'LIBERO'} onChange={() => agg({ tipo: 'LIBERO', minEventi: form.minEventi ?? 2 })} style={{ width: 'auto' }} /> Libero — il cliente sceglie</label>
      </div>
      <SelettoreEventi selezionati={form.eventiIds} onChange={(ids) => agg({ eventiIds: ids })} />
      {form.tipo === 'LIBERO' && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>Eventi minimi da scegliere <CampoNumero value={form.minEventi ?? undefined} onChange={(v) => agg({ minEventi: v ?? null })} /></label>
          <label>Eventi massimi (vuoto = nessun limite) <CampoNumero value={form.maxEventi ?? undefined} onChange={(v) => agg({ maxEventi: v ?? null })} /></label>
        </div>
      )}
      {nonVendibili.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 'var(--testo-md)', color: 'var(--amber)' }}>
          ⚠ {nonVendibili.length} evento/i del bundle non {nonVendibili.length === 1 ? 'è' : 'sono'} al momento vendibil{nonVendibili.length === 1 ? 'e' : 'i'} (nessun tragitto prezzato con posti, o evento passato/eliminato): {nonVendibili.map((e) => e.artista).join(', ')}.
          {form.tipo === 'FISSO' ? ' Un bundle fisso con un evento non vendibile non è acquistabile.' : ''}
        </p>
      )}
    </div>
  );
}

function BundleRegole({ form, agg }: { form: BundleInput; agg: (p: Partial<BundleInput>) => void }) {
  const Flag = ({ chiave, testo }: { chiave: 'ammetteOfferte' | 'ammetteCredito' | 'ammettePromoter' | 'ammetteAcconto'; testo: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
      <input type="checkbox" checked={form[chiave]} onChange={(e) => agg({ [chiave]: e.target.checked } as Partial<BundleInput>)} style={{ width: 'auto' }} />{testo}
    </label>
  );
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <p className="section-label">Regole</p>
      <div className="form-grid">
        <label>Sconto % sul totale dei posti <CampoNumero value={form.scontoPercentuale} onChange={(v) => agg({ scontoPercentuale: v ?? 0 })} /></label>
        <label>Passeggeri minimi per acquisto <CampoNumero value={form.minPosti} onChange={(v) => agg({ minPosti: v ?? 1 })} /></label>
        <label>Passeggeri massimi per acquisto <CampoNumero value={form.maxPosti} onChange={(v) => agg({ maxPosti: v ?? 1 })} /></label>
      </div>
      <p className="testo-intro" style={{ margin: '6px 0 10px' }}>Lo stesso numero di passeggeri vale per tutti gli eventi del bundle. Lo sconto si applica prima di credito e commissione promoter.</p>
      <Flag chiave="ammetteOfferte" testo="Ammette offerte e codici sconto" />
      <Flag chiave="ammetteCredito" testo="Ammette il credito fedeltà (si scala dal totale già scontato)" />
      <Flag chiave="ammettePromoter" testo="Vendibile dai promoter (commissione sul netto)" />
      <Flag chiave="ammetteAcconto" testo="Ammette il pagamento con acconto" />
    </div>
  );
}

function BundleVendita({ form, agg, organizzatori }: { form: BundleInput; agg: (p: Partial<BundleInput>) => void; organizzatori: Organizzatore[] }) {
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <p className="section-label">Vendita</p>
      <div className="form-grid">
        <label>Inizio vendita (ora italiana) <input type="datetime-local" value={aLocale(form.inizioVendita)} onChange={(e) => agg({ inizioVendita: daLocale(e.target.value) })} /></label>
        <label>Fine vendita (ora italiana) <input type="datetime-local" value={aLocale(form.fineVendita)} onChange={(e) => agg({ fineVendita: daLocale(e.target.value) })} /></label>
      </div>
      <p className="testo-intro" style={{ margin: '6px 0 10px' }}>Senza date il bundle resta in bozza. In vendita, programmato o terminato lo decide l'ora, non un interruttore.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}><input type="checkbox" checked={form.visibileSeProgrammato} onChange={(e) => agg({ visibileSeProgrammato: e.target.checked })} style={{ width: 'auto' }} />Visibile sul sito prima dell'inizio ("Disponibile dal …")</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}><input type="checkbox" checked={form.visibileSeTerminato} onChange={(e) => agg({ visibileSeTerminato: e.target.checked })} style={{ width: 'auto' }} />Visibile sul sito dopo la fine ("Vendita terminata")</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}><input type="checkbox" checked={form.attivo} onChange={(e) => agg({ attivo: e.target.checked })} style={{ width: 'auto' }} />Attivo (spegnilo per disattivare subito, a prescindere dalle date)</label>
      <div className="campo">
        <label>Vendibile anche dal link di un organizzatore</label>
        <select value={form.organizzatoreId ?? ''} onChange={(e) => agg({ organizzatoreId: e.target.value || null })}>
          <option value="">— Solo dal sito principale —</option>
          {organizzatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>
    </div>
  );
}

function BundleRiepilogo({ form }: { form: BundleInput }) {
  return (
    <div className="evento-riepilogo-box">
      <div className="riepilogo-riga-evento"><span>Nome</span><b>{form.nome || '—'}</b></div>
      <div className="riepilogo-riga-evento"><span>Tipo</span><b>{form.tipo === 'FISSO' ? 'Fisso' : 'Libero'}</b></div>
      <div className="riepilogo-riga-evento"><span>Eventi</span><b>{form.eventiIds.length}{form.tipo === 'LIBERO' ? ` (minimo ${form.minEventi ?? 1}${form.maxEventi ? `, massimo ${form.maxEventi}` : ''})` : ''}</b></div>
      <div className="riepilogo-riga-evento"><span>Passeggeri per acquisto</span><b>da {form.minPosti} a {form.maxPosti}</b></div>
      <div className="riepilogo-riga-evento"><span>Sconto</span><b>{form.scontoPercentuale}%</b></div>
      <div className="riepilogo-riga-evento"><span>Ammette</span><b>{[form.ammetteOfferte && 'offerte', form.ammetteCredito && 'credito', form.ammettePromoter && 'promoter', form.ammetteAcconto && 'acconto'].filter(Boolean).join(', ') || 'nessuna delle quattro'}</b></div>
      <div className="riepilogo-riga-evento"><span>Vendita</span><b>{form.inizioVendita && form.fineVendita ? `${formattaDataOraIt(form.inizioVendita)} → ${formattaDataOraIt(form.fineVendita)}` : 'da programmare (resta in bozza)'}</b></div>
      <div className="riepilogo-riga-evento"><span>In evidenza in home</span><b>{form.inEvidenzaHome ? 'Sì' : 'No'}</b></div>
    </div>
  );
}
