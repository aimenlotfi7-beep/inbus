import { useEffect, useState } from 'react';
import { offerteApi, type Offerta, type OffertaInput } from '../../../api/offerte';
import { campagneApi, type Campagna } from '../../../api/campagne';
import { ErroreApi } from '../../../api/client';

function slugSuggerito(nomeEvento: string, nomeOfferta: string) {
  const pulisci = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return [pulisci(nomeEvento), pulisci(nomeOfferta)].filter(Boolean).join('-');
}

export function OfferteTab({ eventoId, nomeEvento }: { eventoId: string; nomeEvento: string }) {
  const [offerte, setOfferte] = useState<Offerta[]>([]);
  const [campagne, setCampagne] = useState<Campagna[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [formAperto, setFormAperto] = useState(false);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugModificatoAMano, setSlugModificatoAMano] = useState(false);
  const [scontoPercentuale, setScontoPercentuale] = useState('');
  const [campagnaId, setCampagnaId] = useState('');
  const [limiteUtilizzi, setLimiteUtilizzi] = useState('');
  const [linkCopiato, setLinkCopiato] = useState<string | null>(null);

  function ricarica() {
    setCaricamento(true);
    offerteApi.listByEvento(eventoId).then(setOfferte).finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    campagneApi.list().then(setCampagne).catch(() => setCampagne([]));
  }, [eventoId]);

  function apriNuova() {
    setNome(''); setSlug(''); setSlugModificatoAMano(false);
    setScontoPercentuale(''); setCampagnaId(''); setLimiteUtilizzi('');
    setFormAperto(true);
  }

  function cambiaNome(v: string) {
    setNome(v);
    if (!slugModificatoAMano) setSlug(slugSuggerito(nomeEvento, v));
  }

  async function salva() {
    if (!nome.trim() || !slug.trim() || !scontoPercentuale) {
      alert('Compila almeno nome, link (slug) e percentuale di sconto.');
      return;
    }
    const payload: OffertaInput = {
      eventoId, nome, slug,
      scontoPercentuale: Number(scontoPercentuale),
      campagnaId: campagnaId || undefined,
      limiteUtilizzi: limiteUtilizzi ? Number(limiteUtilizzi) : undefined,
      attiva: true,
    };
    try {
      await offerteApi.create(payload);
      setFormAperto(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  async function toggleAttiva(o: Offerta) {
    await offerteApi.update(o.id, { attiva: !o.attiva });
    ricarica();
  }
  async function elimina(o: Offerta) {
    if (!confirm(`Eliminare l'offerta "${o.nome}"?`)) return;
    await offerteApi.remove(o.id);
    ricarica();
  }

  function linkOfferta(o: Offerta) {
    return `${window.location.origin}/offerta/${o.slug}`;
  }
  async function copiaLink(o: Offerta) {
    const link = linkOfferta(o);
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopiato(o.id);
      setTimeout(() => setLinkCopiato(null), 2500);
    } catch {
      window.prompt('Copia questo link:', link);
    }
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;

  return (
    <div>
      <p className="testo-intro">
        Crea un link con uno sconto percentuale dedicato per una campagna pubblicitaria (es. "-20%" per chi arriva
        da Meta) — si applica al prezzo normale di qualunque fermata scelga il cliente. Il link pubblico porta solo
        un nome, mai lo sconto: non è modificabile dal browser.
      </p>

      {!formAperto && <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={apriNuova}>+ Nuova offerta</button>}

      {formAperto && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <div className="campo"><label>Nome offerta</label><input value={nome} onChange={(e) => cambiaNome(e.target.value)} placeholder="es. Meta Retargeting" /></div>
          <div className="campo">
            <label>Link (si vedrà come /offerta/...)</label>
            <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugModificatoAMano(true); }} />
          </div>
          <div className="form-grid">
            <label>Sconto (%) <input type="number" min={1} max={100} value={scontoPercentuale} onChange={(e) => setScontoPercentuale(e.target.value)} placeholder="es. 20" /></label>
            <label>Limite utilizzi (facoltativo) <input type="number" value={limiteUtilizzi} onChange={(e) => setLimiteUtilizzi(e.target.value)} placeholder="vuoto = illimitati" /></label>
          </div>
          <div className="campo">
            <label>
              Campagna collegata (facoltativa)
              <select value={campagnaId} onChange={(e) => setCampagnaId(e.target.value)}>
                <option value="">— Nessuna —</option>
                {campagne.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={salva}>Salva e genera link</button>
            <button className="btn btn-ghost" onClick={() => setFormAperto(false)}>Annulla</button>
          </div>
        </div>
      )}

      {offerte.length === 0 && !formAperto && <p className="testo-intro">Nessuna offerta creata ancora per questo evento.</p>}

      {offerte.map((o) => (
        <div key={o.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span className="riga-titolo">
            {o.nome} — -{Number(o.scontoPercentuale).toFixed(0)}% su tutte le tratte
            <br />
            <span style={{ color: 'var(--mist)', fontSize: 12 }}>
              /offerta/{o.slug} · {o.utilizzi} utilizzi{o.limiteUtilizzi ? ` / ${o.limiteUtilizzi}` : ''}
            </span>
          </span>
          <span className="riga-meta">
            <span className={`badge ${o.attiva ? 'coperta' : 'non-coperta'}`} style={{ cursor: 'pointer' }} onClick={() => toggleAttiva(o)}>
              {o.attiva ? 'Attiva' : 'Disattiva'}
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => copiaLink(o)}>
              {linkCopiato === o.id ? '✓ Copiato' : '🔗 Copia link'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px', color: 'var(--pink)' }} onClick={() => elimina(o)}>Elimina</button>
          </span>
        </div>
      ))}
    </div>
  );
}
