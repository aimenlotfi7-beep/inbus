import { useEffect, useState } from 'react';
import { tourApi, type TourRiga, type TourInput } from '../../api/tour';
import { notifica } from '../shared/notifiche';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CaricaFile } from '../shared/CaricaFile';
import { SelettoreEventi } from '../shared/SelettoreEventi';

const VUOTO: TourInput = { nome: '', copertinaUrl: null, eventiIds: [] };

/** Più date dello stesso spettacolo, raggruppate solo per come
 *  compaiono sul sito (vedi tour.service.ts sul backend per il
 *  perché). Ogni evento si crea e si gestisce come sempre, in Eventi
 *  — qui si sceglie solo quali raggruppare sotto una card unica. */
export function TourScreen() {
  const [lista, setLista] = useState<TourRiga[]>([]);
  const [aperto, setAperto] = useState<{ id: string | null } | null>(null);

  function ricarica() { tourApi.list().then(setLista).catch(() => setLista([])); }
  useEffect(ricarica, []);

  async function elimina(t: TourRiga) {
    if (!confirm(`Eliminare il tour "${t.nome}"? Gli eventi che raggruppa NON vengono toccati — tornano semplicemente a comparire come eventi singoli sul sito.`)) return;
    try { await tourApi.remove(t.id); notifica('Tour eliminato.', 'successo'); ricarica(); }
    catch (e) { notifica(e instanceof ErroreApi ? e.message : 'Eliminazione non riuscita.'); }
  }

  if (aperto) return <TourForm tourId={aperto.id} onChiudi={() => { setAperto(null); ricarica(); }} />;

  return (
    <div>
      <PanelHead titolo="Tour" azione={<button className="btn btn-primary" onClick={() => setAperto({ id: null })}>+ Nuovo tour</button>} />
      <p className="testo-intro" style={{ marginBottom: 16 }}>
        Più date dello stesso spettacolo (es. 10 concerti in giorni diversi) raggruppate sotto una card sola sul sito. Ogni data resta un evento indipendente — crealo prima normalmente in Eventi, poi selezionalo qui.
      </p>
      {lista.length === 0 ? (
        <p className="testo-intro">Nessun tour creato ancora.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((t) => (
            <div key={t.id} className="section-card" style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setAperto({ id: t.id })}>
              {t.copertinaUrl ? (
                <img src={t.copertinaUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--dusk-2)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <b>{t.nome}</b>
                <p style={{ fontSize: 12.5, color: 'var(--mist)', marginTop: 2 }}>{t.numeroEventi} data/e</p>
              </div>
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)' }} onClick={(e) => { e.stopPropagation(); elimina(t); }}>Elimina</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TourForm({ tourId, onChiudi }: { tourId: string | null; onChiudi: () => void }) {
  const [form, setForm] = useState<TourInput>(VUOTO);
  const [eventiEliminati, setEventiEliminati] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!tourId) return;
    tourApi.dettaglio(tourId).then((t) => {
      setForm({ nome: t.nome, slug: t.slug, copertinaUrl: t.copertinaUrl, eventiIds: t.eventi.map((e) => e.id) });
      setEventiEliminati(t.eventi.filter((e) => e.eliminato).map((e) => e.artista));
    }).catch(() => notifica('Tour non trovato.'));
  }, [tourId]);

  async function salva() {
    if (salvando) return;
    if (!form.nome.trim()) { notifica('Inserisci il nome del tour.'); return; }
    if (form.eventiIds.length === 0) { notifica('Scegli almeno un evento da raggruppare.'); return; }
    setSalvando(true);
    try {
      if (tourId) await tourApi.update(tourId, form); else await tourApi.create(form);
      notifica('Tour salvato.', 'successo');
      onChiudi();
    } catch (e) {
      notifica(e instanceof ErroreApi ? e.message : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally { setSalvando(false); }
  }

  return (
    <PaginaSezione titolo={tourId ? 'Modifica tour' : 'Nuovo tour'} onIndietro={onChiudi}
      azioni={<button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva tour'}</button>}>
      {eventiEliminati.length > 0 && (
        <p style={{ background: 'var(--dusk)', border: '1px solid var(--pink)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          ⚠ {eventiEliminati.length} evento/i in questo tour {eventiEliminati.length === 1 ? 'è stato eliminato' : 'sono stati eliminati'} ({eventiEliminati.join(', ')}) — salvando, {eventiEliminati.length === 1 ? 'esce' : 'escono'} automaticamente dal tour.
        </p>
      )}
      <div className="section-card" style={{ marginBottom: 16, maxWidth: 520 }}>
        <p className="section-label">Informazioni</p>
        <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Vasco Rossi — Roma" /></div>
        <div className="campo">
          <label>Copertina (propria del tour, non di una singola data)</label>
          {form.copertinaUrl && <img src={form.copertinaUrl} alt="" style={{ maxWidth: 240, borderRadius: 8, display: 'block', marginBottom: 8 }} />}
          <div style={{ display: 'flex', gap: 8 }}>
            <CaricaFile onCaricato={(url) => setForm({ ...form, copertinaUrl: url })} etichetta="+ Carica copertina" />
            {form.copertinaUrl && <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...form, copertinaUrl: null })}>Rimuovi</button>}
          </div>
        </div>
      </div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <p className="section-label">Date da raggruppare</p>
        <p className="testo-intro" style={{ marginBottom: 10 }}>Scegli tra gli eventi già esistenti — non servono consecutivi, né lo stesso mese.</p>
        <SelettoreEventi selezionati={form.eventiIds} onChange={(ids) => setForm({ ...form, eventiIds: ids })} />
      </div>
    </PaginaSezione>
  );
}
