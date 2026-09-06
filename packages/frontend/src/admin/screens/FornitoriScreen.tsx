import { useEffect, useState } from 'react';
import { fornitoriApi, type Fornitore, type FornitoreInput, type StatoFornitore, type CampoExtraConfig } from '../../api/fornitori';
import { geocodifica } from '../shared/geo';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';

const VUOTO: Partial<FornitoreInput> = { nome: '', partitaIva: '', referente: '', telefono: '', email: '', indirizzo: '', note: '', invioAutomatico: false };

const ETICHETTA_STATO: Record<StatoFornitore, string> = { IN_ATTESA: '◔ In attesa', APPROVATO: '✓ Approvato', DISATTIVATO: '✕ Disattivato' };
const CLASSE_STATO: Record<StatoFornitore, string> = { IN_ATTESA: 'badge-stato-arancio', APPROVATO: 'badge-stato-verde', DISATTIVATO: 'badge-stato-rosso' };

export function FornitoriScreen() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [inModifica, setInModifica] = useState<Fornitore | null>(null);
  const [form, setForm] = useState<Partial<FornitoreInput>>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');
  // Configurazione campi extra del form pubblico — gestita da qui
  // stesso invece di una schermata a parte, è un dettaglio piccolo che
  // riguarda solo i fornitori.
  const [campiExtraConfig, setCampiExtraConfig] = useState<CampoExtraConfig[]>([]);
  const [gestisciCampiExtraAperto, setGestisciCampiExtraAperto] = useState(false);
  const [nuovoCampoExtra, setNuovoCampoExtra] = useState('');

  function ricarica() { fornitoriApi.list().then(setFornitori); }
  function ricaricaCampiExtraConfig() { fornitoriApi.campiExtraConfig().then(setCampiExtraConfig); }
  useEffect(() => { ricarica(); ricaricaCampiExtraConfig(); }, []);

  const fornitoriFiltrati = ricerca.trim()
    ? fornitori.filter((f) => `${f.nome} ${f.referente ?? ''} ${f.indirizzo ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : fornitori;

  const inAttesaCount = fornitori.filter((f) => f.stato === 'IN_ATTESA').length;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(f: Fornitore) { setInModifica(f); setForm(f); setModaleAperta(true); }

  const [salvando, setSalvando] = useState(false);
  async function salva() {
    if (salvando) return;
    if (!form.nome) return;
    setSalvando(true);
    try {
      // Geocodifica solo se manca (un indirizzo già geocodificato, non
      // toccato in questa modifica, non va rifatto ogni volta) o se
      // l'indirizzo è cambiato rispetto a quello salvato — altrimenti
      // ogni salvataggio di un fornitore rifarebbe la stessa ricerca.
      let { lat, lng } = form;
      if (form.indirizzo?.trim() && form.indirizzo !== inModifica?.indirizzo) {
        const r = await geocodifica(form.indirizzo);
        if (r.coordinate) { lat = r.coordinate.lat; lng = r.coordinate.lng; }
      }
      const daSalvare = { ...form, lat, lng };
      if (inModifica) await fornitoriApi.update(inModifica.id, daSalvare);
      else await fornitoriApi.create(daSalvare);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally {
      setSalvando(false);
    }
  }
  async function elimina(f: Fornitore) {
    if (!confirm(`Eliminare "${f.nome}"?`)) return;
    await fornitoriApi.remove(f.id);
    ricarica();
  }
  async function cambiaStato(f: Fornitore, stato: StatoFornitore) {
    await fornitoriApi.cambiaStato(f.id, stato);
    ricarica();
  }

  function copiaLinkRegistrazione() {
    navigator.clipboard.writeText(`${window.location.origin}/fornitore/registrati`);
    alert('Link copiato — condividilo con chi vuoi far registrare come fornitore.');
  }

  async function aggiungiCampoExtra() {
    if (!nuovoCampoExtra.trim()) return;
    await fornitoriApi.creaCampoExtraConfig({ etichetta: nuovoCampoExtra.trim(), ordine: campiExtraConfig.length });
    setNuovoCampoExtra('');
    ricaricaCampiExtraConfig();
  }
  async function rimuoviCampoExtra(id: string) {
    await fornitoriApi.eliminaCampoExtraConfig(id);
    ricaricaCampiExtraConfig();
  }

  if (gestisciCampiExtraAperto) {
    return (
      <PaginaSezione titolo="Campi extra nel form pubblico" onIndietro={() => setGestisciCampiExtraAperto(false)}>
        <p style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>Campi in più, oltre a ragione sociale/P.IVA/indirizzo/email/telefono/referente, che compaiono nel form di autoregistrazione — solo testo semplice, un'etichetta e basta.</p>
        {campiExtraConfig.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{c.etichetta}</span>
            <button className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12 }} onClick={() => rimuoviCampoExtra(c.id)}>Rimuovi</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input placeholder="Nome del nuovo campo (es. Numero flotta)" value={nuovoCampoExtra} onChange={(e) => setNuovoCampoExtra(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={aggiungiCampoExtra}>+ Aggiungi</button>
        </div>
      </PaginaSezione>
    );
  }

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica fornitore' : 'Nuovo fornitore'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome</label><input value={form.nome ?? ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="campo"><label>Partita IVA</label><input value={form.partitaIva ?? ''} onChange={(e) => setForm({ ...form, partitaIva: e.target.value })} /></div>
        <div className="campo"><label>Referente</label><input value={form.referente ?? ''} onChange={(e) => setForm({ ...form, referente: e.target.value })} /></div>
        <div className="campo"><label>Telefono</label><input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="campo"><label>Indirizzo</label><input value={form.indirizzo ?? ''} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} /></div>
        <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <label title="Se attivo, quando questo fornitore rientra nel raggio della PRIMA richiesta preventivo di un tragitto, la mail gli parte da sola." style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.invioAutomatico ?? false} onChange={(e) => setForm({ ...form, invioAutomatico: e.target.checked })} style={{ width: 'auto' }} />
          Invio automatico della richiesta preventivo (se nel raggio)
        </label>
        {inModifica?.campiExtra && inModifica.campiExtra.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Campi extra (dall'autoregistrazione)</p>
            {inModifica.campiExtra.map((c, i) => <p key={i} style={{ fontSize: 13, margin: '2px 0' }}>{c.etichetta}: {c.valore}</p>)}
          </div>
        )}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva fornitore'}</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Fornitori" azione={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setGestisciCampiExtraAperto(true)}>Campi extra</button>
          <button className="btn btn-ghost" onClick={copiaLinkRegistrazione}>Link registrazione</button>
          <button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo fornitore</button>
        </div>
      } />
      {inAttesaCount > 0 && (
        <p style={{ background: 'var(--dusk)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          <b style={{ color: 'var(--amber)' }}>{inAttesaCount}</b> fornitore/i in attesa di approvazione — controlla la colonna Stato qui sotto.
        </p>
      )}
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, referente o indirizzo..." />
      <TabellaGenerica
        righe={fornitoriFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (f) => <b>{f.nome}</b> },
          { etichetta: 'Referente', render: (f) => f.referente ?? '—' },
          { etichetta: 'Telefono', render: (f) => f.telefono ?? '—' },
          { etichetta: 'Indirizzo', render: (f) => f.indirizzo ?? '—' },
          {
            etichetta: 'Stato',
            render: (f) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className={`badge ${CLASSE_STATO[f.stato]}`}>{ETICHETTA_STATO[f.stato]}</span>
                {f.stato === 'IN_ATTESA' && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => cambiaStato(f, 'APPROVATO')}>Approva</button>}
                {f.stato === 'APPROVATO' && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--pink)' }} onClick={() => cambiaStato(f, 'DISATTIVATO')}>Disattiva</button>}
                {f.stato === 'DISATTIVATO' && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => cambiaStato(f, 'APPROVATO')}>Riattiva</button>}
              </div>
            ),
          },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
