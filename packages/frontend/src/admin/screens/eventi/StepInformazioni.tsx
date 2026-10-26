import { useEffect, useState } from 'react';
import type { EventoInput } from '../../../api/eventi';
import { impostazioniApi } from '../../../api/impostazioni';
import type { Categoria } from '../../../api/categorie';
import type { CategoriaEvento } from '../../../api/categorieEvento';
import { CampoNumero } from '../../shared/CampoNumero';
import { EtichettaTooltip } from '../../shared/EtichettaTooltip';
import { infoCompleta, descrizioneCompilata } from './completamento';
import { oggiIsoRoma } from '../../../shared/formato';

/** Passo 1 della scheda evento (Informazioni / Descrizione). Estratto
 *  da SchedaEventoModale: riceve il form e il suo setter, le liste
 *  generi/categorie e le due azioni "nuovo genere/categoria" (restano
 *  nel genitore perché ricaricano le liste). La sotto-tab è stato
 *  locale: non interessa a nessun altro. */
export function StepInformazioni({ form, setForm, inCreazione, categorie, categorieEvento, onNuovoGenere, onNuovaCategoria, mappaTooltip }: {
  form: EventoInput;
  setForm: (f: EventoInput) => void;
  inCreazione: boolean;
  categorie: Categoria[];
  categorieEvento: CategoriaEvento[];
  onNuovoGenere: () => void;
  onNuovaCategoria: () => void;
  mappaTooltip: Record<string, string>;
}) {
  const [subTabInfo, setSubTabInfo] = useState<'info' | 'descrizione'>('info');
  // La soglia di Impostazioni, da scrivere accanto al campo dell'evento.
  const [sogliaGenerale, setSogliaGenerale] = useState<number | null>(null);
  useEffect(() => {
    impostazioniApi.calcoloPrezzi().then((r) => setSogliaGenerale(r.sogliaOccupazionePareggio)).catch(() => {});
  }, []);
  return (
  <>
    <div className="sub-tabs">
      <button type="button" className={`sub-tab${subTabInfo === 'info' ? ' active' : (inCreazione && infoCompleta(form)) ? ' completato' : ''}`} onClick={() => setSubTabInfo('info')}>Informazioni</button>
      <button type="button" className={`sub-tab${subTabInfo === 'descrizione' ? ' active' : (inCreazione && descrizioneCompilata(form)) ? ' completato' : ''}`} onClick={() => setSubTabInfo('descrizione')}>Descrizione</button>
    </div>

    {subTabInfo === 'info' && (
      <>
        <div className="form-grid">
          <label style={{ gridColumn: '1 / -1' }}>Artista <input value={form.artista} onChange={(e) => setForm({ ...form, artista: e.target.value })} /></label>
          <label>Genere
            <select value={form.genere} onChange={(e) => { if (e.target.value === '__nuovo__') { onNuovoGenere(); return; } setForm({ ...form, genere: e.target.value }); }}>
              <option value="" disabled>Scegli un genere…</option>
              {categorie.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              {form.genere && !categorie.some((c) => c.nome === form.genere) && (
                <option value={form.genere}>{form.genere}</option>
              )}
              <option value="__nuovo__">+ Nuovo genere…</option>
            </select>
          </label>
          <label>
            <EtichettaTooltip testo="Categoria" chiave="categoria" mappaTooltip={mappaTooltip} />
            <select
              aria-label="Categoria"
              value={form.categoria ?? ''}
              onChange={(e) => { if (e.target.value === '__nuova__') { onNuovaCategoria(); return; } setForm({ ...form, categoria: e.target.value || null }); }}
            >
              <option value="">— Nessuna —</option>
              {categorieEvento.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              {form.categoria && !categorieEvento.some((c) => c.nome === form.categoria) && (
                <option value={form.categoria}>{form.categoria}</option>
              )}
              <option value="__nuova__">+ Nuova categoria…</option>
            </select>
          </label>
          <label>Luogo <input value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} /></label>
          <label>Città <input value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
          <label>Data <input type="date" min={oggiIsoRoma()} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
          <label>
            <EtichettaTooltip testo="URL" chiave="url" mappaTooltip={mappaTooltip} />
            <input
              aria-label="URL della pagina evento"
              value={form.slug ?? ''}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder={`es. ${(form.artista || 'nome-evento').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(form.citta || 'citta').toLowerCase()}`}
            />
          </label>
          <label>Acconto (€)
            <CampoNumero valuta min={1} value={form.accontoEur} onChange={(v) => setForm({ ...form, accontoEur: v ?? 0 })} />
          </label>
          <label>
            <EtichettaTooltip testo="Avviso disponibilità" chiave="avviso_disponibilita" mappaTooltip={mappaTooltip} />
            <select
              aria-label="Avviso disponibilità"
              value={form.statoDisponibilita ?? ''}
              onChange={(e) => setForm({ ...form, statoDisponibilita: (e.target.value || null) as typeof form.statoDisponibilita })}
            >
              <option value="">Automatico (calcolato dai posti veri)</option>
              <option value="POCHI_POSTI">Pochi posti disponibili</option>
              <option value="NUOVI_POSTI">Nuovi posti disponibili</option>
              <option value="ESAURITO">Posti terminati</option>
            </select>
          </label>
        </div>
        <div className="campo">
          <label><input type="checkbox" checked={form.inEvidenza ?? false} onChange={(e) => setForm({ ...form, inEvidenza: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> In evidenza in homepage</label>
        </div>
        <div className="campo">
          <label>
            <input type="checkbox" aria-label="Visibile sul sito" checked={form.visibileSito ?? true} onChange={(e) => setForm({ ...form, visibileSito: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} />
            <EtichettaTooltip testo="Visibile sul sito" chiave="visibile_sito" mappaTooltip={mappaTooltip} />
          </label>
        </div>

        {/* Le due date del piano bus, solo per questo evento: vuote
            valgono quelle generali di Impostazioni (proprietario,
            ottobre 2026). */}
        <p className="section-label">Date di questo evento</p>
        <div className="form-grid">
          <label>Decisione del piano bus
            <input
              type="date"
              aria-label="Data di decisione del piano bus"
              value={form.decisionePianoIl ?? ''}
              onChange={(e) => setForm({ ...form, decisionePianoIl: e.target.value || null })}
            />
            <small className="testo-secondario">
              Fino a questa data si raccolgono prenotazioni e nessuna richiesta di preventivo parte. Vuota: vale quella generale.
            </small>
          </label>
          <label>Fine vendite
            <input
              type="date"
              aria-label="Data di fine vendite"
              value={form.fineVenditeIl ?? ''}
              onChange={(e) => setForm({ ...form, fineVenditeIl: e.target.value || null })}
            />
            <small className="testo-secondario">
              Da questa data non si compra più, ma la lista d'attesa resta aperta. Vuota: vale quella generale.
            </small>
          </label>
        </div>

        {/* La soglia di pareggio solo per questo evento (proprietario,
            ottobre 2026: un evento molto richiesto può rischiare di più).
            Vuota vale quella di Impostazioni. */}
        <p className="section-label">Pareggio di questo evento</p>
        <div className="form-grid">
          <label>Soglia di pareggio (%)
            <input
              type="number" min={1} max={100} step={1}
              aria-label="Soglia di pareggio di questo evento, in percentuale"
              placeholder={sogliaGenerale !== null ? `Generale: ${sogliaGenerale}%` : 'Come in Impostazioni'}
              value={form.sogliaPareggio ?? ''}
              onChange={(e) => setForm({ ...form, sogliaPareggio: e.target.value === '' ? null : Math.round(Number(e.target.value)) })}
            />
            <small className="testo-secondario">
              Più bassa: bus in più proposto prima e prezzi calcolati più alti. Vuota: vale Impostazioni
              {sogliaGenerale !== null ? ` (${sogliaGenerale}%)` : ''}. Un tragitto può averne una sua in Partenze › Prezzi.
            </small>
          </label>
        </div>
      </>
    )}

    {subTabInfo === 'descrizione' && (
      <>
        <div className="campo">
          <label><EtichettaTooltip testo="Informazioni viaggio per i clienti" chiave="informazioni_viaggio" mappaTooltip={mappaTooltip} /></label>
          <textarea
            value={form.descrizione ?? ''}
            onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
            rows={5}
            placeholder="Es. orario e punto di ritrovo, cosa portare, regole del bus, contatti in caso di emergenza…"
          />
        </div>
        <div className="campo">
          <label><EtichettaTooltip testo="Descrizione evento" chiave="descrizione_evento" mappaTooltip={mappaTooltip} /></label>
          <textarea
            value={form.descrizioneSeo ?? ''}
            onChange={(e) => setForm({ ...form, descrizioneSeo: e.target.value })}
            rows={4}
            placeholder="Un testo descrittivo sull'evento/artista — se la lasci vuota, per Google viene generata automaticamente (artista, data, città, prezzo), ma sulla pagina non comparirà nessuna sezione."
          />
        </div>
        <div className="campo">
          <label><EtichettaTooltip testo="Cosa è incluso" chiave="cosa_incluso" mappaTooltip={mappaTooltip} /></label>
          <textarea
            value={form.cosaIncluso ?? ''}
            onChange={(e) => setForm({ ...form, cosaIncluso: e.target.value })}
            rows={3}
            placeholder="Es. Viaggio A/R in bus, posto assegnato, assistenza tour leader. Il biglietto d'ingresso all'evento NON è incluso."
          />
        </div>
        <div className="campo">
          <label><EtichettaTooltip testo="Requisiti e restrizioni" chiave="requisiti_evento" mappaTooltip={mappaTooltip} /></label>
          <textarea
            value={form.requisitiNote ?? ''}
            onChange={(e) => setForm({ ...form, requisitiNote: e.target.value })}
            rows={3}
            placeholder="Es. Non adatto a minori di 12 anni non accompagnati. Posti limitati per persone a mobilità ridotta, contattare l'assistenza prima di prenotare."
          />
        </div>
      </>
    )}
  </>
  );
}
