import { useEffect, useState } from 'react';
import { ruoliApi, type Ruolo, type Permesso } from '../../api/ruoli';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

interface FormRuolo {
  nome: string;
  descrizione: string;
  permessi: string[];
}
const VUOTO: FormRuolo = { nome: '', descrizione: '', permessi: [] };

export function RuoliScreen() {
  const [ruoli, setRuoli] = useState<Ruolo[]>([]);
  // Permessi assegnabili: già filtrati dal server in base a ciò che
  // l'utente loggato possiede lui stesso.
  const [permessiAssegnabili, setPermessiAssegnabili] = useState<Permesso[]>([]);
  const [inModifica, setInModifica] = useState<Ruolo | null>(null);
  const [form, setForm] = useState<FormRuolo>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() {
    ruoliApi.list().then(setRuoli);
    ruoliApi.permessiAssegnabili().then(setPermessiAssegnabili);
  }
  useEffect(ricarica, []);

  const moduli = Array.from(new Set(permessiAssegnabili.map((p) => p.modulo)));

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(r: Ruolo) {
    if (r.owner) return; // il ruolo owner non è modificabile
    setInModifica(r);
    setForm({ nome: r.nome, descrizione: r.descrizione ?? '', permessi: r.permessi });
    setModaleAperta(true);
  }

  function togglePermesso(chiave: string) {
    setForm((f) => ({
      ...f,
      permessi: f.permessi.includes(chiave) ? f.permessi.filter((c) => c !== chiave) : [...f.permessi, chiave],
    }));
  }

  async function salva() {
    if (!form.nome) return;
    try {
      if (inModifica) await ruoliApi.update(inModifica.id, form);
      else await ruoliApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }

  async function elimina(r: Ruolo) {
    if (r.owner) { alert('Il ruolo proprietario non può essere eliminato.'); return; }
    if (!confirm(`Eliminare il ruolo "${r.nome}"? Questa azione fallisce se qualche utenza lo sta ancora usando.`)) return;
    try {
      await ruoliApi.remove(r.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Eliminazione non riuscita: ${e.message}` : 'Eliminazione non riuscita: impossibile contattare il server.');
    }
  }

  return (
    <div>
      <PanelHead titolo="Ruoli" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo ruolo</button>} />
      <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 16 }}>
        Puoi creare ruoli con il nome che preferisci e scegliere esattamente cosa può fare chi lo ha.
        Puoi assegnare solo i permessi che possiedi tu stesso.
      </p>
      <TabellaGenerica
        righe={ruoli}
        colonne={[
          { etichetta: 'Nome', render: (r) => r.owner ? `${r.nome} (proprietario)` : r.nome },
          { etichetta: 'Descrizione', render: (r) => r.descrizione ?? '—' },
          { etichetta: 'Permessi', render: (r) => r.owner ? 'Tutti (presenti e futuri)' : `${r.permessi.length} assegnati` },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />

      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica ruolo' : 'Nuovo ruolo'} onClose={() => setModaleAperta(false)}>
          <div className="campo"><label>Nome del ruolo</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Responsabile eventi" /></div>
          <div className="campo"><label>Descrizione (facoltativa)</label><input value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} /></div>

          <label style={{ display: 'block', margin: '16px 0 8px', fontWeight: 600 }}>Permessi</label>
          {permessiAssegnabili.length === 0 && (
            <p style={{ fontSize: 12, opacity: 0.7 }}>Non hai permessi assegnabili ad altri: non puoi creare o modificare ruoli con funzioni.</p>
          )}
          {moduli.map((modulo) => (
            <div key={modulo} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.6, marginBottom: 6 }}>{modulo}</div>
              {permessiAssegnabili.filter((p) => p.modulo === modulo).map((p) => (
                <label key={p.chiave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5 }}>
                  <input type="checkbox" checked={form.permessi.includes(p.chiave)} onChange={() => togglePermesso(p.chiave)} />
                  {p.etichetta}
                </label>
              ))}
            </div>
          ))}

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva ruolo</button>
        </Modale>
      )}
    </div>
  );
}
