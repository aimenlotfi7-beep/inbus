import { useEffect, useState } from 'react';
import { amministratoriApi, type Amministratore, type AmministratoreInput, type LogRiga } from '../../api/amministratori';
import { ruoliApi, type Ruolo } from '../../api/ruoli';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

const VUOTO: AmministratoreInput = { nome: '', email: '', password: '', ruoloId: '' };

export function AmministratoriScreen() {
  const [admin, setAdmin] = useState<Amministratore[]>([]);
  const [log, setLog] = useState<LogRiga[]>([]);
  // Ruoli assegnabili: già filtrati dal server in base a ciò che l'utente
  // loggato possiede lui stesso ("puoi dare solo ciò che hai").
  const [ruoliAssegnabili, setRuoliAssegnabili] = useState<Ruolo[]>([]);
  const [inModifica, setInModifica] = useState<Amministratore | null>(null);
  const [form, setForm] = useState<AmministratoreInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() {
    amministratoriApi.list().then(setAdmin);
    amministratoriApi.log().then(setLog);
    ruoliApi.assegnabili().then((lista) => {
      setRuoliAssegnabili(lista);
      setForm((f) => (f.ruoloId ? f : { ...f, ruoloId: lista[0]?.id ?? '' }));
    });
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
    </div>
  );
}
