import { useState } from 'react';
import type { EventoInput } from '../../../api/eventi';
import type { LayoutBiglietto } from '../../../api/layoutBiglietto';
import { CaricaFile } from '../../shared/CaricaFile';
import { EtichettaTooltip } from '../../shared/EtichettaTooltip';
import { InfoTooltip } from '../../shared/InfoTooltip';
import { TOOLTIP_DEFAULT } from '../../tooltipDefaults';
import { numeroImmagini, bigliettoPersonalizzato } from './completamento';

/** Passo 3 della scheda evento (Immagini / Biglietto). Estratto da
 *  SchedaEventoModale; il campo "nuova immagine" è stato locale, la
 *  sotto-tab no (vedi prop). */
export function StepImmagini({ form, setForm, inCreazione, layoutDisponibili, mappaTooltip, subTabImmagini, setSubTabImmagini }: {
  form: EventoInput;
  setForm: (f: EventoInput) => void;
  inCreazione: boolean;
  layoutDisponibili: LayoutBiglietto[];
  mappaTooltip: Record<string, string>;
  /** Controllata dal genitore: al salvataggio con zero immagini, riporta qui e apre questa sotto-tab. */
  subTabImmagini: 'immagini' | 'biglietto';
  setSubTabImmagini: (v: 'immagini' | 'biglietto') => void;
}) {
  const [nuovaImmagine, setNuovaImmagine] = useState('');
  function aggiungiImmagine() {
    if (!nuovaImmagine.trim()) return;
    setForm({ ...form, immagini: [...(form.immagini ?? []), nuovaImmagine.trim()] });
    setNuovaImmagine('');
  }
  function rimuoviImmagine(idx: number) {
    setForm({ ...form, immagini: (form.immagini ?? []).filter((_, i) => i !== idx) });
  }
  return (
  <>
    <div className="sub-tabs">
      <button type="button" className={`sub-tab${subTabImmagini === 'immagini' ? ' active' : (inCreazione && numeroImmagini(form) > 0) ? ' completato' : ''}`} onClick={() => setSubTabImmagini('immagini')}>Immagini</button>
      <button type="button" className={`sub-tab${subTabImmagini === 'biglietto' ? ' active' : (inCreazione && bigliettoPersonalizzato(form)) ? ' completato' : ''}`} onClick={() => setSubTabImmagini('biglietto')}>Biglietto</button>
    </div>

    {subTabImmagini === 'immagini' && (
      <>
        <p className="section-label" style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
          Immagini (almeno una)
          <InfoTooltip>{mappaTooltip.immagini_evento_intro ?? TOOLTIP_DEFAULT.immagini_evento_intro}</InfoTooltip>
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <input placeholder="https://..." aria-label="Link dell'immagine" value={nuovaImmagine} onChange={(e) => setNuovaImmagine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aggiungiImmagine(); } }} style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={aggiungiImmagine}>+ Aggiungi link</button>
          <CaricaFile onCaricato={(url) => setForm({ ...form, immagini: [...(form.immagini ?? []), url] })} etichetta="+ Carica file" />
        </div>
        {(form.immagini ?? []).map((url, idx) => (
          <div key={idx} className="riga-cliccabile" style={{ cursor: 'default', gap: 10 }}>
            {/* Anteprima: prima si vedeva solo il link, senza poter
                controllare che fosse l'immagine giusta (o che si caricasse). */}
            <img src={url} alt="" style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--dusk-2)' }} />
            <span className="riga-titolo" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12 }} onClick={() => rimuoviImmagine(idx)}>Rimuovi</button>
          </div>
        ))}
        {(form.immagini ?? []).length === 0 && <p className="testo-intro" style={{ fontSize: 13 }}>Nessuna immagine ancora — ne serve almeno una per creare l'evento.</p>}
      </>
    )}

    {subTabImmagini === 'biglietto' && (
      <>
        <p className="section-label" style={{ marginBottom: 14, display: 'flex', alignItems: 'center' }}>
          Grafica del biglietto
          <InfoTooltip>{mappaTooltip.biglietto_grafica_intro ?? TOOLTIP_DEFAULT.biglietto_grafica_intro}</InfoTooltip>
        </p>
        <div className="campo">
          <label>Colore d'accento</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={form.ticketColoreAccento || '#111111'}
              onChange={(e) => setForm({ ...form, ticketColoreAccento: e.target.value })}
              style={{ width: 44, height: 36, padding: 2, flexShrink: 0 }}
            />
            <input
              placeholder="#dc2626"
              value={form.ticketColoreAccento ?? ''}
              onChange={(e) => setForm({ ...form, ticketColoreAccento: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="campo">
          <label><EtichettaTooltip testo="Immagine di intestazione" chiave="immagine_intestazione" mappaTooltip={mappaTooltip} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="https://... (o carica un file)"
              value={form.ticketImmagineSfondoUrl ?? ''}
              onChange={(e) => setForm({ ...form, ticketImmagineSfondoUrl: e.target.value || undefined })}
              style={{ flex: 1 }}
            />
            <CaricaFile onCaricato={(url) => setForm({ ...form, ticketImmagineSfondoUrl: url })} etichetta="Carica" />
          </div>
        </div>
        <div className="campo">
          <label><EtichettaTooltip testo="Layout del biglietto" chiave="layout_biglietto_campo" mappaTooltip={mappaTooltip} /></label>
          <select
            value={form.layoutBigliettoId ?? ''}
            onChange={(e) => setForm({ ...form, layoutBigliettoId: e.target.value || null })}
          >
            <option value="">Predefinito {(() => {
              const p = layoutDisponibili.find((l) => l.predefinito);
              return p ? `(${p.nome})` : '';
            })()}</option>
            {layoutDisponibili.filter((l) => !l.predefinito).map((l) => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
        </div>
      </>
    )}
  </>
  );
}
