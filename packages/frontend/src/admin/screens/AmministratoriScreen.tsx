import { useEffect, useState } from 'react';
import { amministratoriApi, type Amministratore, type AmministratoreInput, type LogRiga, type EccezionePermesso } from '../../api/amministratori';
import { ruoliApi, type Ruolo, type Permesso } from '../../api/ruoli';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CampoCopiabile } from '../shared/CampoCopiabile';

const VUOTO: AmministratoreInput = { nome: '', email: '', password: '', ruoloId: '' };

type StatoPermesso = 'ruolo' | 'extra' | 'negato' | 'nessuno';

export function AmministratoriScreen() {
  const [admin, setAdmin] = useState<Amministratore[]>([]);
  const [log, setLog] = useState<LogRiga[]>([]);
  const [ruoliAssegnabili, setRuoliAssegnabili] = useState<Ruolo[]>([]);
  const [permessiAssegnabili, setPermessiAssegnabili] = useState<Permesso[]>([]);
  const [inModifica, setInModifica] = useState<Amministratore | null>(null);
  const [form, setForm] = useState<AmministratoreInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  const [permessiUtenza, setPermessiUtenza] = useState<Amministratore | null>(null);
  const [permessiRuolo, setPermessiRuolo] = useState<string[]>([]);
  const [ruoloOwnerTarget, setRuoloOwnerTarget] = useState(false);
  const [statoPermessi, setStatoPermessi] = useState<Record<string, StatoPermesso>>({});
  const [ricerca, setRicerca] = useState('');

  function ricarica() {
    amministratoriApi.list().then(setAdmin);
    amministratoriApi.log().then(setLog);
    ruoliApi.assegnabili().then((lista) => {
      setRuoliAssegnabili(lista);
      setForm((f) => (f.ruoloId ? f : { ...f, ruoloId: lista[0]?.id ?? '' }));
    });
    ruoliApi.permessiAssegnabili().then(setPermessiAssegnabili);
  }
  useEffect(ricarica, []);

  function nomeRuolo(ruoloId: string) {
    return ruoliAssegnabili.find((r) => r.id === ruoloId)?.nome ?? '—';
  }

  const adminFiltrati = ricerca.trim()
    ? admin.filter((a) => `${a.nome} ${a.email} ${nomeRuolo(a.ruoloId)}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : admin;

  function apriNuovo() { setInModifica(null); setForm({ ...VUOTO, ruoloId: ruoliAssegnabili[0]?.id ?? '' }); setModaleAperta(true); }
  function apriModifica(a: Amministratore) { setInModifica(a); setForm({ nome: a.nome, email: a.email, ruoloId: a.ruoloId, attivo: a.attivo }); setModaleAperta(true); }

  async function salva() {
    if (!form.nome || !form.email || !form.ruoloId) return;
    try {
      if (inModifica) await amministratoriApi.update(inModifica.id, form);
      else await amministratoriApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(a: Amministratore) {
    if (!confirm(`Eliminare l'amministratore "${a.nome}"?`)) return;
    try {
      await amministratoriApi.remove(a.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Eliminazione non riuscita: ${e.message}` : 'Eliminazione non riuscita: impossibile contattare il server.');
    }
  }

  async function apriPermessi(a: Amministratore) {
    try {
      const dati = await amministratoriApi.permessi(a.id);
      if (dati.ruoloOwner) {
        alert('Questa utenza ha il ruolo proprietario: ha già tutti i permessi, non servono eccezioni personali.');
        return;
      }
      setPermessiUtenza(a);
      setRuoloOwnerTarget(dati.ruoloOwner);
      setPermessiRuolo(dati.permessiRuolo);
      const stato: Record<string, StatoPermesso> = {};
      for (const p of permessiAssegnabili) {
        const daRuolo = dati.permessiRuolo.includes(p.chiave);
        const eccezione = dati.eccezioni.find((e) => e.chiave === p.chiave);
        if (eccezione) stato[p.chiave] = eccezione.concesso ? 'extra' : 'negato';
        else stato[p.chiave] = daRuolo ? 'ruolo' : 'nessuno';
      }
      setStatoPermessi(stato);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile aprire i permessi: ${e.message}` : 'Impossibile aprire i permessi: errore di rete.');
    }
  }

  function ciclaStato(chiave: string) {
    const daRuolo = permessiRuolo.includes(chiave);
    setStatoPermessi((s) => {
      const attuale = s[chiave];
      let prossimo: StatoPermesso;
      if (daRuolo) prossimo = attuale === 'ruolo' ? 'negato' : 'ruolo';
      else prossimo = attuale === 'nessuno' ? 'extra' : 'nessuno';
      return { ...s, [chiave]: prossimo };
    });
  }

  async function salvaPermessi() {
    if (!permessiUtenza) return;
    const eccezioni: EccezionePermesso[] = [];
    for (const [chiave, stato] of Object.entries(statoPermessi)) {
      if (stato === 'extra') eccezioni.push({ chiave, concesso: true });
      if (stato === 'negato') eccezioni.push({ chiave, concesso: false });
    }
    try {
      await amministratoriApi.salvaPermessi(permessiUtenza.id, eccezioni);
      setPermessiUtenza(null);
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }

  const moduli = Array.from(new Set(permessiAssegnabili.map((p) => p.modulo)));

  const ETICHETTA_STATO: Record<StatoPermesso, string> = {
    ruolo: '✓ Dal ruolo',
    extra: '+ Concesso in più',
    negato: '✕ Tolto',
    nessuno: '— Non attivo',
  };
  const CLASSE_STATO: Record<StatoPermesso, string> = {
    ruolo: 'dal-ruolo', extra: 'concesso-extra', negato: 'negato', nessuno: 'non-attivo',
  };

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica amministratore' : 'Nuovo amministratore'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        {!inModifica && <div className="campo"><label>Password</label><input type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
        <div className="campo">
          <label>Ruolo</label>
          <select value={form.ruoloId} onChange={(e) => setForm({ ...form, ruoloId: e.target.value })}>
            {ruoliAssegnabili.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
          {ruoliAssegnabili.length === 0 && (
            <p className="testo-intro" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              Nessun ruolo assegnabile trovato: vai in "Ruoli" e crea prima un ruolo con permessi tuoi o inferiori.
            </p>
          )}
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva amministratore</button>
      </PaginaSezione>
    );
  }

  if (permessiUtenza && !ruoloOwnerTarget) {
    return (
      <PaginaSezione titolo={`Permessi personali di ${permessiUtenza.nome}`} onIndietro={() => setPermessiUtenza(null)}>
        <p className="testo-intro">
          Di base questa utenza ha i permessi del ruolo "{nomeRuolo(permessiUtenza.ruoloId)}". Clicca un permesso per
          aggiungerlo o toglierlo solo per questa persona, indipendentemente dal ruolo. Puoi togliere qualsiasi
          permesso, ma puoi concederne in più solo tra quelli che possiedi tu stesso.
        </p>
        {moduli.map((modulo) => (
          <div key={modulo} className="gruppo-modulo">
            <p className="section-label">{modulo}</p>
            {permessiAssegnabili.filter((p) => p.modulo === modulo).map((p) => {
              const stato = statoPermessi[p.chiave] ?? 'nessuno';
              return (
                <button key={p.chiave} type="button" onClick={() => ciclaStato(p.chiave)} className="riga-cliccabile">
                  <span className="riga-titolo">{p.etichetta}</span>
                  <span className={`badge ${CLASSE_STATO[stato]}`}>{ETICHETTA_STATO[stato]}</span>
                </button>
              );
            })}
          </div>
        ))}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={salvaPermessi}>Salva permessi personali</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Amministratori" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo amministratore</button>} />
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <CampoCopiabile etichetta="Link di accesso al gestionale (per tutti, inclusi i Collaboratori)" valore={`${window.location.origin}/admin.html`} link />
      </div>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o ruolo..." />
      <TabellaGenerica
        righe={adminFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (a) => <b>{a.nome}</b> },
          { etichetta: 'Email', render: (a) => a.email },
          { etichetta: 'Ruolo', render: (a) => nomeRuolo(a.ruoloId) },
          { etichetta: 'Stato', render: (a) => a.attivo ? 'Attivo' : 'Disattivo' },
          { etichetta: 'Permessi extra', render: (a) => <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => apriPermessi(a)}>Personalizza</button> },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />

      <h3 style={{ fontSize: 16, margin: '30px 0 14px' }}>Log attività recenti</h3>
      <TabellaGenerica
        righe={log.map((l) => ({ ...l, id: l.id }))}
        colonne={[
          { etichetta: 'Azione', render: (l) => <b>{l.azione}</b> },
          { etichetta: 'Dettaglio', render: (l) => l.dettaglio ?? '—' },
          { etichetta: 'Quando', render: (l) => new Date(l.data).toLocaleString('it-IT') },
        ]}
      />
    </div>
  );
}
