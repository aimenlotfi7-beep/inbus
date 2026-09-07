import { useEffect, useState } from 'react';
import { bundleApi, type BundleInput, type EventoDelBundle, ETICHETTA_STATO_BUNDLE } from '../../../api/bundle';
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

  async function salva() {
    if (salvando) return;
    if (!form.nome.trim()) { notifica('Inserisci il nome del bundle.'); return; }
    if (form.eventiIds.length === 0) { notifica('Scegli almeno un evento.'); return; }
    setSalvando(true);
    try {
      if (bundleId) await bundleApi.update(bundleId, form); else await bundleApi.create(form);
      notifica('Bundle salvato.');
      onChiudi();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally { setSalvando(false); }
  }

  const nonVendibili = eventiDettaglio.filter((e) => form.eventiIds.includes(e.id) && (!e.vendibile || e.eliminato));

  return (
    <PaginaSezione titolo={bundleId ? 'Modifica bundle' : 'Nuovo bundle'} onIndietro={onChiudi} larga
      azioni={<button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva bundle'}</button>}>
      {statoAttuale && <p className="testo-intro" style={{ marginBottom: 12 }}>Stato attuale: <b>{statoAttuale}</b> (calcolato da date e attivazione, non si imposta a mano).</p>}
      <BundleInfo form={form} agg={agg} />
      <BundleEventi form={form} agg={agg} nonVendibili={nonVendibili} />
      <BundleRegole form={form} agg={agg} />
      <BundleVendita form={form} agg={agg} organizzatori={organizzatori} />
    </PaginaSezione>
  );
}

function BundleInfo({ form, agg }: { form: BundleInput; agg: (p: Partial<BundleInput>) => void }) {
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <p className="section-label">Informazioni</p>
      <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => agg({ nome: e.target.value })} placeholder="es. Rassegna Estate 2027" /></div>
      <div className="campo"><label>Descrizione</label><textarea rows={4} value={form.descrizione ?? ''} onChange={(e) => agg({ descrizione: e.target.value })} /></div>
      <div className="campo">
        <label>Copertina (propria del bundle, non di un evento)</label>
        {form.copertinaUrl && <img src={form.copertinaUrl} alt="" style={{ maxWidth: 240, borderRadius: 8, display: 'block', marginBottom: 8 }} />}
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
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--amber)' }}>
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
        <label>Vendibile anche dal link di un organizzatore (solo se tutti gli eventi sono suoi)</label>
        <select value={form.organizzatoreId ?? ''} onChange={(e) => agg({ organizzatoreId: e.target.value || null })}>
          <option value="">— Solo dal sito principale —</option>
          {organizzatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>
    </div>
  );
}
