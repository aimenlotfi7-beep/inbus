import { useEffect, useState } from 'react';
import { couponApi, type Coupon, type CouponInput } from '../../api/coupon';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { CampoNumero } from '../shared/CampoNumero';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';

const VUOTO: CouponInput = { codice: '', tipo: 'PERCENTUALE', valore: 10, attivo: true };

export function CouponScreen() {
  const [coupon, setCoupon] = useState<Coupon[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { couponApi.list().then(setCoupon); }
  useEffect(ricarica, []);
  useEffect(() => { eventiApi.list().then(setEventi); }, []);

  const couponFiltrati = ricerca.trim()
    ? coupon.filter((c) => c.codice.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : coupon;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(c: Coupon) { setInModifica(c); setForm({ codice: c.codice, tipo: c.tipo, valore: Number(c.valore), usiMax: c.usiMax ?? undefined, attivo: c.attivo, eventoId: c.eventoId ?? null }); setModaleAperta(true); }

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

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica coupon' : 'Nuovo coupon'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Codice</label><input value={form.codice} onChange={(e) => setForm({ ...form, codice: e.target.value.toUpperCase() })} /></div>
        <div className="campo">
          <label>Tipo</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as CouponInput['tipo'] })}>
            <option value="PERCENTUALE">Percentuale</option>
            <option value="FISSO">Importo fisso</option>
          </select>
        </div>
        <div className="campo"><label>Valore</label><CampoNumero valuta={form.tipo === 'FISSO'} value={form.valore} onChange={(v) => setForm({ ...form, valore: v ?? 0 })} /></div>
        <div className="campo"><label>Usi massimi (vuoto = illimitati)</label><CampoNumero value={form.usiMax} onChange={(v) => setForm({ ...form, usiMax: v })} /></div>
        <div className="campo">
          <label>Valido per</label>
          <select value={form.eventoId ?? ''} onChange={(e) => setForm({ ...form, eventoId: e.target.value || null })}>
            <option value="">Tutti gli eventi</option>
            {eventi.map((ev) => <option key={ev.id} value={ev.id}>{ev.artista} — {ev.citta}</option>)}
          </select>
        </div>
        <div className="campo">
          <label><input type="checkbox" checked={form.attivo ?? true} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> Attivo</label>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva coupon</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Coupon" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo coupon</button>} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per codice coupon..." />
      <TabellaGenerica
        righe={couponFiltrati}
        colonne={[
          { etichetta: 'Codice', render: (c) => <b>{c.codice}</b> },
          { etichetta: 'Sconto', render: (c) => <b>{c.tipo === 'PERCENTUALE' ? `${c.valore}%` : `€${c.valore}`}</b> },
          { etichetta: 'Usi', render: (c) => `${c.usiAttuali} / ${c.usiMax ?? '∞'}` },
          { etichetta: 'Valido per', render: (c) => c.eventoId ? (eventi.find((ev) => ev.id === c.eventoId)?.artista ?? 'Evento eliminato') : 'Tutti gli eventi' },
          { etichetta: 'Stato', render: (c) => c.attivo ? 'Attivo' : 'Disattivo' },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
