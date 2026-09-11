import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { campagneApi, type Campagna, type CampagnaInput, type RigaReportFonte } from '../../api/campagne';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { formattaEuro } from '../../shared/formato';

const VUOTO: CampagnaInput = { nome: '', piattaforma: '', tipo: '', utmSource: '', utmMedium: '', utmCampaign: '', utmContent: '', attiva: true };

const ETICHETTA_PERIODO: { chiave: string; etichetta: string; giorni: number | null }[] = [
  { chiave: '30', etichetta: 'Ultimi 30 giorni', giorni: 30 },
  { chiave: '90', etichetta: 'Ultimi 90 giorni', giorni: 90 },
  { chiave: 'tutto', etichetta: 'Da sempre', giorni: null },
];

/** Non "che campagne esistono" (l'anagrafica sotto) ma "quanto ha reso
 *  ognuna" — fatturato reale con lo sconto bundle già scorporato e la
 *  commissione promoter già sottratta (margine netto), non il lordo. */
function ReportFatturato() {
  const [periodo, setPeriodo] = useState('30');
  const [righe, setRighe] = useState<RigaReportFonte[] | null>(null);

  useEffect(() => {
    const giorni = ETICHETTA_PERIODO.find((p) => p.chiave === periodo)?.giorni;
    const dataDa = giorni ? new Date(Date.now() - giorni * 86400000).toISOString() : undefined;
    setRighe(null);
    campagneApi.report(dataDa).then(setRighe).catch(() => setRighe([]));
  }, [periodo]);

  const totaleFatturato = righe?.reduce((s, r) => s + r.fatturato, 0) ?? 0;
  const totaleMargine = righe?.reduce((s, r) => s + r.margineNetto, 0) ?? 0;

  return (
    <div className="section-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p className="section-label" style={{ margin: 0 }}>Fatturato per fonte</p>
        <div className="mini-tabs">
          {ETICHETTA_PERIODO.map((p) => (
            <button key={p.chiave} type="button" className={`mini-tab${periodo === p.chiave ? ' active' : ''}`} onClick={() => setPeriodo(p.chiave)}>{p.etichetta}</button>
          ))}
        </div>
      </div>
      {righe === null ? (
        <p className="testo-intro">Carico...</p>
      ) : righe.length === 0 ? (
        <p className="testo-intro">Nessuna prenotazione confermata in questo periodo.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 10, padding: '4px 0', fontSize: 'var(--testo-xs)', color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .3, borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <span>Fonte</span><span>Prenotazioni</span><span>Passeggeri</span><span>Fatturato</span><span>Commissione</span><span>Margine netto</span>
          </div>
          {righe.map((r) => (
            <div key={r.fonte} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 'var(--testo-base)' }}>
              <span>{r.fonte}{r.scontoBundleApplicato > 0 && <span style={{ fontSize: 'var(--testo-xs)', color: 'var(--mist)', display: 'block' }}>di cui {formattaEuro(r.scontoBundleApplicato)} di sconto bundle</span>}</span>
              <span>{r.numeroPrenotazioni}</span>
              <span>{r.passeggeri}</span>
              <span style={{ fontWeight: 600 }}>{formattaEuro(r.fatturato)}</span>
              <span style={{ color: r.commissione > 0 ? 'var(--pink)' : undefined }}>{r.commissione > 0 ? `− ${formattaEuro(r.commissione)}` : '—'}</span>
              <span style={{ fontWeight: 700 }}>{formattaEuro(r.margineNetto)}</span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 10, padding: '10px 0 2px', fontSize: 'var(--testo-base)', fontWeight: 700 }}>
            <span>Totale</span><span /><span /><span>{formattaEuro(totaleFatturato)}</span><span /><span>{formattaEuro(totaleMargine)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Le campagne servono a sapere da dove arriva un cliente (Meta, Google,
 *  newsletter...) — si collegano alle Offerte (sezione dentro ogni
 *  evento) per dare un prezzo dedicato a chi arriva da una campagna. */
export function CampagneScreen() {
  const [campagne, setCampagne] = useState<Campagna[]>([]);
  const [inModifica, setInModifica] = useState<Campagna | null>(null);
  const [form, setForm] = useState<CampagnaInput>(VUOTO);
  const [aperta, setAperta] = useState(false);

  function ricarica() { campagneApi.list().then(setCampagne); }
  useEffect(ricarica, []);

  function apriNuova() { setInModifica(null); setForm(VUOTO); setAperta(true); }
  function apriModifica(c: Campagna) {
    setInModifica(c);
    setForm({ nome: c.nome, piattaforma: c.piattaforma ?? '', tipo: c.tipo ?? '', utmSource: c.utmSource ?? '', utmMedium: c.utmMedium ?? '', utmCampaign: c.utmCampaign ?? '', utmContent: c.utmContent ?? '', attiva: c.attiva });
    setAperta(true);
  }

  const [salvando, setSalvando] = useState(false);
  async function salva() {
    if (salvando) return;
    if (!form.nome.trim()) { notifica('Dai un nome alla campagna.'); return; }
    setSalvando(true);
    try {
      if (inModifica) await campagneApi.update(inModifica.id, form);
      else await campagneApi.create(form);
      setAperta(false);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }
  async function elimina(c: Campagna) {
    if (!confirm(`Eliminare la campagna "${c.nome}"?`)) return;
    await campagneApi.remove(c.id);
    ricarica();
  }

  if (aperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica campagna' : 'Nuova campagna'} onIndietro={() => setAperta(false)}>
        <div className="campo"><label>Nome campagna</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Salmo Meta Retargeting Agosto" /></div>
        <div className="form-grid">
          <label>Piattaforma <input value={form.piattaforma ?? ''} onChange={(e) => setForm({ ...form, piattaforma: e.target.value })} placeholder="es. Meta, Google, Instagram" /></label>
          <label>Tipo <input value={form.tipo ?? ''} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="es. Retargeting, Acquisizione" /></label>
        </div>
        <p className="section-label" style={{ marginTop: 12 }}>Parametri UTM (facoltativi, per il tracciamento)</p>
        <div className="form-grid">
          <label>utm_source <input value={form.utmSource ?? ''} onChange={(e) => setForm({ ...form, utmSource: e.target.value })} /></label>
          <label>utm_medium <input value={form.utmMedium ?? ''} onChange={(e) => setForm({ ...form, utmMedium: e.target.value })} /></label>
          <label>utm_campaign <input value={form.utmCampaign ?? ''} onChange={(e) => setForm({ ...form, utmCampaign: e.target.value })} /></label>
          <label>utm_content <input value={form.utmContent ?? ''} onChange={(e) => setForm({ ...form, utmContent: e.target.value })} /></label>
        </div>
        <div className="campo" style={{ marginTop: 12 }}>
          <label><input type="checkbox" checked={form.attiva ?? true} onChange={(e) => setForm({ ...form, attiva: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> Attiva</label>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva campagna'}</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Campagne" azione={<button className="btn btn-primary" onClick={apriNuova}>+ Nuova campagna</button>} info="Le campagne si collegano alle Offerte (dentro la scheda di ogni evento) per dare un prezzo dedicato e tracciare da dove arrivano le prenotazioni." />
      <ReportFatturato />
      <p className="section-label" style={{ marginBottom: 8 }}>Anagrafica campagne</p>
      <TabellaGenerica
        righe={campagne}
        colonne={[
          { etichetta: 'Nome', render: (c) => <b>{c.nome}</b> },
          { etichetta: 'Piattaforma', render: (c) => c.piattaforma ?? '—' },
          { etichetta: 'Tipo', render: (c) => c.tipo ?? '—' },
          { etichetta: 'Stato', render: (c) => c.attiva ? 'Attiva' : 'Disattiva' },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
