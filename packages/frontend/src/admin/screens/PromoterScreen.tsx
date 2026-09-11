import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { SelettoreEventi } from '../shared/SelettoreEventi';
import { notifica } from '../shared/notifiche';
import { promoterApi, type Promoter, type PromoterInput } from '../../api/promoter';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { CampoNumero } from '../shared/CampoNumero';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CampoCopiabile } from '../shared/CampoCopiabile';
import { formattaEuro } from '../../shared/formato';

const VUOTO: PromoterInput = { nome: '', email: '', password: '', commissionePercentuale: 10 };

export function PromoterScreen() {
  const [promoter, setPromoter] = useState<Promoter[]>([]);
  const [inModifica, setInModifica] = useState<Promoter | null>(null);
  const [form, setForm] = useState<PromoterInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [statistiche, setStatistiche] = useState<{ numeroPrenotazioni: number; fatturato: number } | null>(null);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { promoterApi.list().then(setPromoter); }
  useEffect(ricarica, []);

  const promoterFiltrati = ricerca.trim()
    ? promoter.filter((p) => `${p.nome} ${p.email} ${p.codice}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : promoter;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setStatistiche(null); setModaleAperta(true); }
  function apriModifica(p: Promoter) {
    setInModifica(p);
    setForm({ nome: p.nome, email: p.email, telefono: p.telefono ?? undefined, commissionePercentuale: Number(p.commissionePercentuale) });
    setModaleAperta(true);
    promoterApi.statistiche(p.id).then(setStatistiche);
  }

  const [salvando, setSalvando] = useState(false);
  async function salva() {
    if (salvando) return;
    if (!form.nome || !form.email) return;
    setSalvando(true);
    try {
      if (inModifica) await promoterApi.update(inModifica.id, form);
      else await promoterApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally {
      setSalvando(false);
    }
  }
  async function elimina(p: Promoter) {
    if (!confirm(`Eliminare il promoter "${p.nome}"?`)) return;
    await promoterApi.remove(p.id);
    ricarica();
  }

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica promoter' : 'Nuovo promoter'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="campo"><label>Telefono</label><input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
        {!inModifica && <div className="campo"><label>Password iniziale</label><input type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
        <div className="campo"><label>Commissione %</label><CampoNumero value={form.commissionePercentuale ?? 10} onChange={(v) => setForm({ ...form, commissionePercentuale: v ?? 0 })} /></div>
        {inModifica && (
          <div className="campo">
            <label>Il suo link per un evento</label>
            <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 6 }}>
              Un codice diverso per ogni evento (mai il suo nome nel link) — scegli l'evento, il link si genera da solo.
            </p>
            <SelettoreLinkPromoter promoterId={inModifica.id} />
          </div>
        )}
        <div className="campo">
          <label>Eventi esclusi (facoltativo)</label>
          <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 6 }}>Di default vende tutti gli eventi, anche quelli creati dopo — scegli qui solo quelli che NON deve poter vendere.</p>
          <SelettoreEventi selezionati={form.eventiEsclusi ?? []} onChange={(ids) => setForm({ ...form, eventiEsclusi: ids })} />
        </div>
        {statistiche && (
          <p style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 14 }}>
            {statistiche.numeroPrenotazioni} prenotazioni portate · {formattaEuro(statistiche.fatturato)} di fatturato generato
          </p>
        )}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva promoter'}</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Promoter" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo promoter</button>} />
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <CampoCopiabile etichetta="Link di accesso per i promoter" valore={`${window.location.origin}/promoter`} link />
      </div>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o codice..." />
      <TabellaGenerica
        righe={promoterFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (p) => <b>{p.nome}</b> },
          { etichetta: 'Email', render: (p) => p.email },
          { etichetta: 'Codice', render: (p) => <b>{p.codice}</b> },
          { etichetta: 'Commissione', render: (p) => `${p.commissionePercentuale}%` },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}

/** Sceglie un evento tra quelli esistenti, poi mostra il link opaco
 *  già pronto per quella coppia (promoter, evento) — generato lato
 *  server la prima volta che viene chiesto, sempre lo stesso dopo. */
function SelettoreLinkPromoter({ promoterId }: { promoterId: string }) {
  const [eventi, setEventi] = useState<{ id: string; artista: string; data: string }[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [caricando, setCaricando] = useState(false);

  useEffect(() => {
    eventiApi.list().then((lista) => setEventi(lista.map((e) => ({ id: e.id, artista: e.artista, data: e.data })).sort((a, b) => a.data < b.data ? 1 : -1)));
  }, []);

  useEffect(() => {
    if (!eventoId) { setLink(null); return; }
    setCaricando(true);
    promoterApi.linkAdmin(promoterId, eventoId).then((r) => setLink(r.url)).catch(() => setLink(null)).finally(() => setCaricando(false));
  }, [promoterId, eventoId]);

  return (
    <div>
      <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="">— Scegli un evento —</option>
        {eventi.map((ev) => <option key={ev.id} value={ev.id}>{ev.artista} — {new Date(ev.data).toLocaleDateString('it-IT')}</option>)}
      </select>
      {eventoId && (caricando ? <p style={{ fontSize: 13, color: 'var(--mist)' }}>Genero il link...</p> : link && <CampoCopiabile etichetta="" valore={link} />)}
    </div>
  );
}
