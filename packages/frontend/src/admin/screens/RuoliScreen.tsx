import { useEffect, useState } from 'react';
import { ruoliApi, type Ruolo, type Permesso } from '../../api/ruoli';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';

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
  const [ricerca, setRicerca] = useState('');

  function ricarica() {
    ruoliApi.list().then(setRuoli);
    ruoliApi.permessiAssegnabili().then(setPermessiAssegnabili);
  }
  useEffect(ricarica, []);

  const ruoliFiltrati = ricerca.trim()
    ? ruoli.filter((r) => r.nome.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : ruoli;

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

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica ruolo' : 'Nuovo ruolo'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome del ruolo</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Responsabile eventi" /></div>
        <div className="campo"><label>Descrizione (facoltativa)</label><input value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} /></div>

        <p className="section-label" style={{ marginTop: 16, fontSize: 13, textTransform: 'none', letterSpacing: 0, color: 'var(--paper)', fontWeight: 700 }}>Permessi</p>
        {permessiAssegnabili.length === 0 && (
          <p className="testo-intro" style={{ fontSize: 13 }}>Non hai permessi assegnabili ad altri: non puoi creare o modificare ruoli con funzioni.</p>
        )}
        {moduli.map((modulo) => (
          <div key={modulo} className="gruppo-modulo">
            <p className="section-label">{modulo}</p>
            {permessiAssegnabili.filter((p) => p.modulo === modulo).map((p) => (
              <label key={p.chiave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', fontSize: 14 }}>
                <input type="checkbox" checked={form.permessi.includes(p.chiave)} onChange={() => togglePermesso(p.chiave)} />
                {p.etichetta}
              </label>
            ))}
          </div>
        ))}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva ruolo</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Ruoli" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo ruolo</button>} />
      <p className="testo-intro">
        Puoi creare ruoli con il nome che preferisci e scegliere esattamente cosa può fare chi lo ha.
        Puoi assegnare solo i permessi che possiedi tu stesso.
      </p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome ruolo..." />
      <TabellaGenerica
        righe={ruoliFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (r) => r.owner ? `${r.nome} (proprietario)` : r.nome },
          { etichetta: 'Descrizione', render: (r) => r.descrizione ?? '—' },
          { etichetta: 'Permessi', render: (r) => r.owner ? 'Tutti (presenti e futuri)' : `${r.permessi.length} assegnati` },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
