import { useEffect, useState } from 'react';
import { tourApi, type TourRiga, type TourInput } from '../../api/tour';
import { notifica } from '../shared/notifiche';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CaricaFile } from '../shared/CaricaFile';
import { SelettoreEventi } from '../shared/SelettoreEventi';
import { TourCardCompatta } from '../shared/TourCardCompatta';
import { EtichettaTooltip } from '../shared/EtichettaTooltip';
import { useMappaTooltip } from '../shared/useMappaTooltip';

const VUOTO: TourInput = { nome: '', copertinaUrl: null, descrizione: '', descrizioneSeo: '', eventiIds: [] };

/** Più date dello stesso spettacolo, raggruppate solo per come
 *  compaiono sul sito (vedi tour.service.ts sul backend per il
 *  perché). Ogni evento si crea e si gestisce come sempre, in Eventi
 *  — qui si sceglie solo quali raggruppare sotto una card unica. */
export function TourScreen() {
  const [lista, setLista] = useState<TourRiga[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [aperto, setAperto] = useState<{ id: string | null } | null>(null);

  function ricarica() { tourApi.list().then(setLista).catch(() => setLista([])); }
  useEffect(ricarica, []);

  const filtrati = ricerca.trim() ? lista.filter((t) => t.nome.toLowerCase().includes(ricerca.trim().toLowerCase())) : lista;

  async function elimina(t: TourRiga) {
    if (!confirm(`Eliminare il tour "${t.nome}"? Gli eventi che raggruppa NON vengono toccati — tornano semplicemente a comparire come eventi singoli sul sito.`)) return;
    try { await tourApi.remove(t.id); notifica('Tour eliminato.', 'successo'); ricarica(); }
    catch (e) { notifica(e instanceof ErroreApi ? e.message : 'Eliminazione non riuscita.'); }
  }

  if (aperto) return <TourForm tourId={aperto.id} onChiudi={() => { setAperto(null); ricarica(); }} />;

  return (
    <div>
      <PanelHead titolo="Tour" azione={<button className="btn btn-primary" onClick={() => setAperto({ id: null })}>+ Nuovo tour</button>} />
      <p className="testo-intro" style={{ marginBottom: 12 }}>
        Più date dello stesso spettacolo (es. 10 concerti in giorni diversi) raggruppate sotto una card sola sul sito. Ogni data resta un evento indipendente — crealo prima normalmente in Eventi, poi selezionalo qui.
      </p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome..." />
      {filtrati.length === 0 ? (
        <p className="testo-intro">{ricerca ? 'Nessun tour trovato.' : 'Nessun tour creato ancora.'}</p>
      ) : (
        <div className="cards-list">
          {filtrati.map((t) => (
            <TourCardCompatta key={t.id} tour={t} onClick={() => setAperto({ id: t.id })} onElimina={() => elimina(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TourForm({ tourId, onChiudi }: { tourId: string | null; onChiudi: () => void }) {
  const mappaTooltip = useMappaTooltip();
  const [form, setForm] = useState<TourInput>(VUOTO);
  const [eventiEliminati, setEventiEliminati] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  // Copertina anche da link diretto, oltre al caricamento file — stesso
  // schema già usato per il Bundle.
  const [linkCopertina, setLinkCopertina] = useState('');
  function aggiungiDaLink() {
    if (!linkCopertina.trim()) return;
    setForm((f) => ({ ...f, copertinaUrl: linkCopertina.trim() }));
    setLinkCopertina('');
  }
  const [subTab, setSubTab] = useState<'informazioni' | 'descrizione'>('informazioni');

  useEffect(() => {
    if (!tourId) return;
    tourApi.dettaglio(tourId).then((t) => {
      setForm({ nome: t.nome, slug: t.slug, copertinaUrl: t.copertinaUrl, descrizione: t.descrizione ?? '', descrizioneSeo: t.descrizioneSeo ?? '', eventiIds: t.eventi.map((e) => e.id) });
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
    <PaginaSezione titolo={tourId ? 'Modifica tour' : 'Nuovo tour'} onIndietro={onChiudi} larga
      azioni={<button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva tour'}</button>}>
      {eventiEliminati.length > 0 && (
        <p style={{ background: 'var(--dusk)', border: '1px solid var(--pink)', borderRadius: 8, padding: '10px 14px', fontSize: 'var(--testo-md)', marginBottom: 14 }}>
          ⚠ {eventiEliminati.length} evento/i in questo tour {eventiEliminati.length === 1 ? 'è stato eliminato' : 'sono stati eliminati'} ({eventiEliminati.join(', ')}) — salvando, {eventiEliminati.length === 1 ? 'esce' : 'escono'} automaticamente dal tour.
        </p>
      )}
      <div className="sub-tabs">
        <button type="button" className={`sub-tab${subTab === 'informazioni' ? ' active' : ''}`} onClick={() => setSubTab('informazioni')}>Informazioni</button>
        <button type="button" className={`sub-tab${subTab === 'descrizione' ? ' active' : ''}`} onClick={() => setSubTab('descrizione')}>Descrizione</button>
      </div>
      {subTab === 'informazioni' && (
      <div className="section-card" style={{ marginBottom: 16, maxWidth: 520 }}>
        <p className="section-label">Informazioni</p>
        <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Vasco Rossi — Roma" /></div>
        <div className="campo">
          <label>Copertina (propria del tour, non di una singola data)</label>
          {form.copertinaUrl && <img src={form.copertinaUrl} alt="" style={{ maxWidth: 240, borderRadius: 8, display: 'block', marginBottom: 8 }} />}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="https://... (o carica un file)" value={linkCopertina} onChange={(e) => setLinkCopertina(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={aggiungiDaLink}>+ Aggiungi</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <CaricaFile onCaricato={(url) => setForm({ ...form, copertinaUrl: url })} etichetta="+ Carica copertina" />
            {form.copertinaUrl && <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...form, copertinaUrl: null })}>Rimuovi</button>}
          </div>
        </div>
      </div>
      )}
      {subTab === 'descrizione' && (
      <div className="section-card" style={{ marginBottom: 16, maxWidth: 520 }}>
        <p className="section-label">Descrizione</p>
        <div className="campo">
          <label><EtichettaTooltip testo="Descrizione del tour" chiave="tour_descrizione_campo" mappaTooltip={mappaTooltip} /></label>
          <textarea
            value={form.descrizione ?? ''}
            onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
            rows={5}
            placeholder="Es. presentazione dello spettacolo, cosa aspettarsi, note comuni a tutte le date..."
          />
        </div>
        <div className="campo">
          <label><EtichettaTooltip testo="Descrizione per i motori di ricerca e social (facoltativa)" chiave="tour_descrizione_seo_campo" mappaTooltip={mappaTooltip} /></label>
          <textarea
            value={form.descrizioneSeo ?? ''}
            onChange={(e) => setForm({ ...form, descrizioneSeo: e.target.value })}
            rows={3}
            placeholder='Se vuota, viene generata automaticamente (es. 12 date disponibili per...)'
          />
        </div>
      </div>
      )}
      <div className="section-card" style={{ marginBottom: 16 }}>
        <p className="section-label"><EtichettaTooltip testo="Date da raggruppare" chiave="tour_date_campo" mappaTooltip={mappaTooltip} /></p>
        <p className="testo-intro" style={{ marginBottom: 10 }}>Scegli tra gli eventi già esistenti — non servono consecutivi, né lo stesso mese.</p>
        <SelettoreEventi selezionati={form.eventiIds} onChange={(ids) => setForm({ ...form, eventiIds: ids })} />
      </div>
    </PaginaSezione>
  );
}
