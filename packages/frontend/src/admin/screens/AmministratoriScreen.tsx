import { useEffect, useState } from 'react';
import { amministratoriApi, type Amministratore, type AmministratoreInput, type LogRiga } from '../../api/amministratori';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

const VUOTO: AmministratoreInput = { nome: '', email: '', password: '', ruolo: 'OPERATORE' };

export function AmministratoriScreen() {
  const [admin, setAdmin] = useState<Amministratore[]>([]);
  const [log, setLog] = useState<LogRiga[]>([]);
  const [inModifica, setInModifica] = useState<Amministratore | null>(null);
  const [form, setForm] = useState<AmministratoreInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() {
    amministratoriApi.list().then(setAdmin);
    amministratoriApi.log().then(setLog);
  }
  useEffect(ricarica, []);

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(a: Amministratore) { setInModifica(a); setForm({ nome: a.nome, email: a.email, ruolo: a.ruolo, attivo: a.attivo }); setModaleAperta(true); }

  async function salva() {
    if (!form.nome || !form.email) return;
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
    await amministratoriApi.remove(a.id);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Amministratori" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo amministratore</button>} />
      <TabellaGenerica
        righe={admin}
        colonne={[
          { etichetta: 'Nome', render: (a) => a.nome },
          { etichetta: 'Email', render: (a) => a.email },
          { etichetta: 'Ruolo', render: (a) => a.ruolo },
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
            <select value={form.ruolo} onChange={(e) => setForm({ ...form, ruolo: e.target.value as Amministratore['ruolo'] })}>
              <option value="AMMINISTRATORE">Amministratore</option>
              <option value="OPERATORE">Operatore</option>
              <option value="COLLABORATORE">Collaboratore</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva amministratore</button>
        </Modale>
      )}
    </div>
  );
}
