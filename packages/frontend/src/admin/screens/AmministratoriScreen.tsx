import { useEffect, useState } from 'react';
import { amministratoriApi, type Amministratore, type AmministratoreInput, type LogRiga, type EccezionePermesso } from '../../api/amministratori';
import { ruoliApi, type Ruolo, type Permesso } from '../../api/ruoli';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

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
    ruolo: '✓ dal ruolo',
    extra: '+ concesso in più',
    negato: '✕ tolto',
    nessuno: '— non attivo',
  };

  return (
    <div>
      <PanelHead titolo="Amministratori" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo amministratore</button>} />
      <TabellaGenerica
        righe={admin}
        colonne={[
          { etichetta: 'Nome', render: (a) => a.nome },
          { etichetta: 'Email', render: (a) => a.email },
          { etichetta: 'Ruolo', render: (a) => nomeRuolo(a.ruoloId) },
          { etichetta: 'Stato', render: (a) => a.attivo ? 'Attivo' : 'Disattivo' },
          { etichetta: 'Permessi extra', render: (a) => <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => apriPermessi(a)}>Personalizza</button> },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />

      <h3 style={{ fontSize: 15, margin: '28px 0 14px' }}>Log attività recenti</h3>
      <TabellaGenerica
        righe={log.map((l) => ({ ...l, id: l.id }))}
        colonne={[
          { etichetta: 'Azione', render: (l) => l.azione },
          { etichetta: 'Dettaglio', render: (l) => l.dettaglio ?? '—' },
          { etichetta: 'Quando', render: (l) => new Date(l.data).toLocaleString('it-IT') },
        ]}
      />

      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica amministratore' : 'Nuovo amministratore'} onClose={() => setModaleAperta(false)}>
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
              <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Nessun ruolo assegnabile trovato: vai in "Ruoli" e crea prima un ruolo con permessi tuoi o inferiori.
              </p>
            )}
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva amministratore</button>
        </Modale>
      )}

      {permessiUtenza && !ruoloOwnerTarget && (
        <Modale titolo={`Permessi personali di ${permessiUtenza.nome}`} onClose={() => setPermessiUtenza(null)}>
          <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 12 }}>
            Di base questa utenza ha i permessi del ruolo "{nomeRuolo(permessiUtenza.ruoloId)}". Clicca un permesso per
            aggiungerlo o toglierlo solo per questa persona, indipendentemente dal ruolo. Puoi togliere qualsiasi
            permesso, ma puoi concederne in più solo tra quelli che possiedi tu stesso.
          </p>
          {moduli.map((modulo) => (
            <div key={modulo} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.6, marginBottom: 6 }}>{modulo}</div>
              {permessiAssegnabili.filter((p) => p.modulo === modulo).map((p) => {
                const stato = statoPermessi[p.chiave] ?? 'nessuno';
                return (
                  <button
                    key={p.chiave}
                    type="button"
                    onClick={() => ciclaStato(p.chiave)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', width: '100%',
                      padding: '6px 8px', fontSize: 13.5, background: 'transparent',
                      border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer',
                      color: stato === 'negato' ? 'var(--pink)' : stato === 'extra' ? '#6fd6a0' : 'inherit',
                    }}
                  >
                    <span>{p.etichetta}</span>
                    <span style={{ opacity: 0.8, fontSize: 12 }}>{ETICHETTA_STATO[stato]}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={salvaPermessi}>Salva permessi personali</button>
        </Modale>
      )}
    </div>
  );
}
