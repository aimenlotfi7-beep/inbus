import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { formattaEuro } from '../../shared/formato';
import { couponApi, type Coupon, type CouponInput } from '../../api/coupon';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { CampoNumero } from '../shared/CampoNumero';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { SelettoreCliente } from '../shared/SelettoreCliente';
import { EtichettaTooltip } from '../shared/EtichettaTooltip';
import { useMappaTooltip } from '../shared/useMappaTooltip';

const VUOTO: CouponInput = { codice: '', tipo: 'PERCENTUALE', valore: 10, attivo: true };

/** Stessa funzione di Coupon (Marketing) — stesso backend, stessa
 *  tabella — ma senza la sezione "assegna a un promoter": qui in
 *  Customer Care serve un codice sconto semplice (es. un rimborso
 *  parziale, un gesto commerciale), non uno strumento di marketing.
 *  L'elenco mostra solo i codici SENZA promoter collegato — quelli con
 *  un promoter restano di competenza della schermata Coupon. */
export function VoucherScreen() {
  const mappaTooltip = useMappaTooltip();
  const [coupon, setCoupon] = useState<Coupon[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { couponApi.list().then((lista) => setCoupon(lista.filter((c) => !c.promoterId))); }
  useEffect(ricarica, []);
  useEffect(() => { eventiApi.list().then(setEventi); }, []);

  const couponFiltrati = ricerca.trim()
    ? coupon.filter((c) => c.codice.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : coupon;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(c: Coupon) {
    setInModifica(c);
    setForm({
      codice: c.codice, tipo: c.tipo, valore: Number(c.valore), usiMax: c.usiMax ?? undefined,
      validoDal: c.validoDal ? c.validoDal.slice(0, 10) : null, validoAl: c.validoAl ? c.validoAl.slice(0, 10) : null,
      attivo: c.attivo, eventoId: c.eventoId ?? null, utenteId: c.utenteId ?? null,
      // Niente promoterId qui — un voucher non è mai collegato a un
      // promoter, per definizione (se lo diventasse, la modifica
      // andrebbe fatta dalla schermata Coupon, non da questa).
    });
    setModaleAperta(true);
  }

  const [inviando, setInviando] = useState(false);
  async function inviaEmail() {
    if (!inModifica) return;
    setInviando(true);
    try {
      const r = await couponApi.inviaEmail(inModifica.id);
      notifica(r.inviata ? `Voucher inviato a ${r.email}.` : 'Invio non riuscito — controlla che la posta sia configurata.', r.inviata ? 'successo' : undefined);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Invio non riuscito.');
    } finally {
      setInviando(false);
    }
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
    if (!confirm(`Eliminare il voucher "${c.codice}"?`)) return;
    await couponApi.remove(c.id);
    ricarica();
  }

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica voucher' : 'Nuovo voucher'} onIndietro={() => setModaleAperta(false)}>
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
          <label><EtichettaTooltip testo="Assegna a un cliente (facoltativo)" chiave="voucher_cliente_campo" mappaTooltip={mappaTooltip} /></label>
          <SelettoreCliente utenteId={form.utenteId ?? null} onChange={(id) => setForm({ ...form, utenteId: id })} />
        </div>
        {inModifica && form.utenteId && (
          <div className="campo">
            <button type="button" className="btn btn-ghost" onClick={inviaEmail} disabled={inviando}>
              {inviando ? 'Invio...' : inModifica.inviatoIl ? `↻ Rinvia via email (inviato il ${new Date(inModifica.inviatoIl).toLocaleDateString('it-IT')})` : '✉ Invia via email'}
            </button>
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
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva voucher'}</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Voucher" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo voucher</button>} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per codice voucher..." />
      <TabellaGenerica
        righe={couponFiltrati}
        colonne={[
          { etichetta: 'Codice', render: (c) => <b>{c.codice}</b> },
          { etichetta: 'Sconto', render: (c) => <b>{c.tipo === 'PERCENTUALE' ? `${c.valore}%` : formattaEuro(c.valore)}</b> },
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
