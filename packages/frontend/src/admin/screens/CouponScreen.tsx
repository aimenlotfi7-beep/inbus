import { useEffect, useState } from 'react';
import { couponApi, type Coupon, type CouponInput } from '../../api/coupon';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

const VUOTO: CouponInput = { codice: '', tipo: 'PERCENTUALE', valore: 10, attivo: true };

export function CouponScreen() {
  const [coupon, setCoupon] = useState<Coupon[]>([]);
  const [inModifica, setInModifica] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() { couponApi.list().then(setCoupon); }
  useEffect(ricarica, []);

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(c: Coupon) { setInModifica(c); setForm({ codice: c.codice, tipo: c.tipo, valore: Number(c.valore), usiMax: c.usiMax ?? undefined, attivo: c.attivo }); setModaleAperta(true); }

  async function salva() {
    if (!form.codice) return;
    try {
      if (inModifica) await couponApi.update(inModifica.id, form);
      else await couponApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(c: Coupon) {
    if (!confirm(`Eliminare il coupon "${c.codice}"?`)) return;
    await couponApi.remove(c.id);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Coupon" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo coupon</button>} />
      <TabellaGenerica
        righe={coupon}
        colonne={[
          { etichetta: 'Codice', render: (c) => c.codice },
          { etichetta: 'Sconto', render: (c) => c.tipo === 'PERCENTUALE' ? `${c.valore}%` : `€${c.valore}` },
          { etichetta: 'Usi', render: (c) => `${c.usiAttuali} / ${c.usiMax ?? '∞'}` },
          { etichetta: 'Stato', render: (c) => c.attivo ? 'Attivo' : 'Disattivo' },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica coupon' : 'Nuovo coupon'} onClose={() => setModaleAperta(false)}>
          <div className="campo"><label>Codice</label><input value={form.codice} onChange={(e) => setForm({ ...form, codice: e.target.value.toUpperCase() })} /></div>
          <div className="campo">
            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as CouponInput['tipo'] })}>
              <option value="PERCENTUALE">Percentuale</option>
              <option value="FISSO">Importo fisso</option>
            </select>
          </div>
          <div className="campo"><label>Valore</label><input type="number" value={form.valore} onChange={(e) => setForm({ ...form, valore: Number(e.target.value) })} /></div>
          <div className="campo"><label>Usi massimi (vuoto = illimitati)</label><input type="number" value={form.usiMax ?? ''} onChange={(e) => setForm({ ...form, usiMax: e.target.value ? Number(e.target.value) : undefined })} /></div>
          <div className="campo">
            <label><input type="checkbox" checked={form.attivo ?? true} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> Attivo</label>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva coupon</button>
        </Modale>
      )}
    </div>
  );
}
