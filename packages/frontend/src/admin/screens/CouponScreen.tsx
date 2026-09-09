import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { couponApi, type Coupon, type CouponInput } from '../../api/coupon';
import { eventiApi } from '../../api/eventi';
import { promoterApi, type Promoter } from '../../api/promoter';
import type { Evento } from '../../api/types';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { CampoNumero } from '../shared/CampoNumero';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { EtichettaTooltip } from '../shared/EtichettaTooltip';
import { useMappaTooltip } from '../shared/useMappaTooltip';

const VUOTO: CouponInput = { codice: '', tipo: 'PERCENTUALE', valore: 10, attivo: true };

export function CouponScreen() {
  const mappaTooltip = useMappaTooltip();
  const [coupon, setCoupon] = useState<Coupon[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [promoterLista, setPromoterLista] = useState<Promoter[]>([]);
  const [inModifica, setInModifica] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { couponApi.list().then(setCoupon); }
  useEffect(ricarica, []);
  useEffect(() => { eventiApi.list().then(setEventi); }, []);
  useEffect(() => { promoterApi.list().then(setPromoterLista); }, []);

  const couponFiltrati = ricerca.trim()
    ? coupon.filter((c) => c.codice.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : coupon;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(c: Coupon) {
    setInModifica(c);
    setForm({
      codice: c.codice, tipo: c.tipo, valore: Number(c.valore), usiMax: c.usiMax ?? undefined,
      validoDal: c.validoDal ? c.validoDal.slice(0, 10) : null, validoAl: c.validoAl ? c.validoAl.slice(0, 10) : null,
      attivo: c.attivo, eventoId: c.eventoId ?? null, promoterId: c.promoterId ?? null,
      compensoTipo: c.compensoTipo, compensoValore: c.compensoValore != null ? Number(c.compensoValore) : null, compensoFissoPer: c.compensoFissoPer,
    });
    setModaleAperta(true);
  }

  const [salvando, setSalvando] = useState(false);
  async function salva() {
    if (salvando) return;
    if (!form.codice) return;
    setSalvando(true);
    try {
      if (inModifica) await couponApi.update(inModifica.id, form);
      else await couponApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally {
      setSalvando(false);
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
          <label><EtichettaTooltip testo="Assegna a un promoter (facoltativo)" chiave="coupon_promoter_campo" mappaTooltip={mappaTooltip} /></label>
          <select value={form.promoterId ?? ''} onChange={(e) => setForm({ ...form, promoterId: e.target.value || null })}>
            <option value="">— Nessuno —</option>
            {promoterLista.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.codice})</option>)}
          </select>
        </div>
        {form.promoterId && (
          <div className="section-card" style={{ marginBottom: 14 }}>
            <p className="section-label" style={{ marginBottom: 8 }}><EtichettaTooltip testo="Compenso per questo codice" chiave="coupon_compenso_campo" mappaTooltip={mappaTooltip} /></p>
            <div className="form-grid">
              <label>Tipo
                <select value={form.compensoTipo ?? ''} onChange={(e) => setForm({ ...form, compensoTipo: (e.target.value || null) as CouponInput['compensoTipo'] })}>
                  <option value="">— Tasso di default dell'account —</option>
                  <option value="PERCENTUALE">Percentuale</option>
                  <option value="FISSO">Importo fisso</option>
                </select>
              </label>
              {form.compensoTipo && (
                <label>{form.compensoTipo === 'PERCENTUALE' ? 'Percentuale (%)' : 'Importo (€)'}
                  <CampoNumero valuta={form.compensoTipo === 'FISSO'} value={form.compensoValore ?? undefined} onChange={(v) => setForm({ ...form, compensoValore: v ?? null })} />
                </label>
              )}
              {form.compensoTipo === 'FISSO' && (
                <label>Si applica
                  <select value={form.compensoFissoPer ?? 'ACQUISTO'} onChange={(e) => setForm({ ...form, compensoFissoPer: e.target.value as CouponInput['compensoFissoPer'] })}>
                    <option value="ACQUISTO">Una volta per acquisto</option>
                    <option value="PASSEGGERO">Per ogni passeggero</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <label>Valido dal (facoltativo)
            <input type="date" value={form.validoDal ?? ''} onChange={(e) => setForm({ ...form, validoDal: e.target.value || null })} />
          </label>
          <label>Valido al (facoltativo)
            <input type="date" value={form.validoAl ?? ''} onChange={(e) => setForm({ ...form, validoAl: e.target.value || null })} />
          </label>
        </div>
        <div className="campo">
          <label><input type="checkbox" checked={form.attivo ?? true} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> Attivo</label>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva coupon'}</button>
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
          { etichetta: 'Promoter', render: (c) => c.promoterId ? (promoterLista.find((p) => p.id === c.promoterId)?.nome ?? '—') : '—' },
          { etichetta: 'Stato', render: (c) => c.attivo ? 'Attivo' : 'Disattivo' },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
