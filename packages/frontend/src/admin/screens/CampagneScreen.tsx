import { useEffect, useState } from 'react';
import { campagneApi, type Campagna, type CampagnaInput } from '../../api/campagne';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';

const VUOTO: CampagnaInput = { nome: '', piattaforma: '', tipo: '', utmSource: '', utmMedium: '', utmCampaign: '', utmContent: '', attiva: true };

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

  async function salva() {
    if (!form.nome.trim()) { alert('Dai un nome alla campagna.'); return; }
    try {
      if (inModifica) await campagneApi.update(inModifica.id, form);
      else await campagneApi.create(form);
      setAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
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
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva campagna</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Campagne" azione={<button className="btn btn-primary" onClick={apriNuova}>+ Nuova campagna</button>} info="Le campagne si collegano alle Offerte (dentro la scheda di ogni evento) per dare un prezzo dedicato e tracciare da dove arrivano le prenotazioni." />
      <TabellaGenerica
        righe={campagne}
        colonne={[
          { etichetta: 'Nome', render: (c) => c.nome },
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
